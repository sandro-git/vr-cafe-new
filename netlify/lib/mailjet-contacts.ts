import Mailjet from "node-mailjet";
import { createClient } from "@supabase/supabase-js";

function getEnv(key: string): string | undefined {
  try { return Netlify.env.get(key); } catch { /* hors contexte Netlify */ }
  return process.env[key];
}

async function getReservationCount(email: string): Promise<number> {
  const url = getEnv("PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return 0;
  try {
    const supabase = createClient(url, anonKey);
    const { count } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("client_email", email)
      .eq("statut", "confirmée");
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function ensureContactProperties(mailjet: Mailjet): Promise<void> {
  const props = [
    { Name: "last_reservation_date", DataType: "datetime", NameSpace: "static" },
    { Name: "reservation_count", DataType: "int", NameSpace: "static" },
    { Name: "vr_type", DataType: "str", NameSpace: "static" },
  ];
  for (const prop of props) {
    try {
      await mailjet.post("contactmetadata", { version: "v3" }).request(prop);
    } catch {
      // Propriété déjà existante — ignoré
    }
  }
}

export async function syncClientToMailjet(params: {
  nom: string;
  email: string;
  telephone: string;
  vrType: string;
  creneauDebut: string;
  apiKey: string;
  apiSecret: string;
}): Promise<void> {
  const { nom, email, telephone, vrType, creneauDebut, apiKey, apiSecret } = params;
  if (!email) return; // Mailjet utilise l'email comme clé de contact — rien à synchroniser sans email
  const listId = getEnv("MAILJET_LIST_ID");
  const mailjet = new Mailjet({ apiKey, apiSecret });

  // 1. Créer ou mettre à jour le contact
  await mailjet.post("contact", { version: "v3" }).request({
    Email: email,
    Name: nom,
    IsExcludedFromCampaigns: false,
  });

  // 2. S'assurer que les propriétés de segmentation existent
  await ensureContactProperties(mailjet);

  // 3. Compter le total des réservations confirmées de ce client
  const reservationCount = await getReservationCount(email);

  // 4. Mettre à jour les propriétés du contact
  await (mailjet.put("contactdata", { version: "v3" }) as any)
    .id(email)
    .request({
      Data: [
        { Name: "last_reservation_date", Value: creneauDebut },
        { Name: "reservation_count", Value: reservationCount },
        { Name: "vr_type", Value: vrType === "sans_fil" ? "VR Sans Fil" : "VR Filaire" },
      ],
    });

  // 5. Ajouter à la liste marketing si configurée
  if (listId) {
    await (mailjet.post("contactslist", { version: "v3" }) as any)
      .id(Number(listId))
      .action("managecontact")
      .request({
        Email: email,
        Action: "addnoforce",
        Properties: { firstname: nom.split(" ")[0], telephone },
      });
  }
}

// ── Synchronisation depuis le back-office (modifier / supprimer) ──────────────

/** Récupère l'ID numérique Mailjet d'un contact à partir de son email (null si absent). */
async function getMailjetContactId(mailjet: Mailjet, email: string): Promise<number | null> {
  try {
    const res: any = await mailjet.get("contact", { version: "v3" }).id(email).request();
    const id = res?.body?.Data?.[0]?.ID;
    return id ? Number(id) : null;
  } catch {
    // 404 = contact inexistant
    return null;
  }
}

/**
 * Suppression définitive (RGPD) d'un contact par ID via l'endpoint v4.
 * Le SDK node-mailjet route mal l'URL v4 (404), on appelle donc l'API en direct
 * sur /v4/contacts/{id} (pluriel). Réponse 200 attendue.
 */
async function hardDeleteMailjetContact(
  apiKey: string,
  apiSecret: string,
  contactId: number
): Promise<void> {
  const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const res = await fetch(`https://api.mailjet.com/v4/contacts/${contactId}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mailjet delete ${contactId} a échoué : ${res.status} ${body.slice(0, 200)}`);
  }
}

/**
 * Suppression définitive (RGPD) d'un contact Mailjet par email.
 * No-op si le contact n'existe pas.
 */
export async function deleteClientFromMailjet(params: {
  email: string;
  apiKey: string;
  apiSecret: string;
}): Promise<void> {
  const { email, apiKey, apiSecret } = params;
  if (!email) return;
  const mailjet = new Mailjet({ apiKey, apiSecret });
  const id = await getMailjetContactId(mailjet, email);
  if (!id) return; // aucun contact à supprimer
  await hardDeleteMailjetContact(apiKey, apiSecret, id);
}

/**
 * Met à jour l'identité d'un contact Mailjet suite à une modification back-office.
 * - Met à jour le nom (PUT, avec création POST en repli si le contact n'existe pas).
 * - Met à jour le téléphone + l'appartenance à la liste marketing.
 * - Si l'email a changé : crée le contact sous le nouvel email puis supprime
 *   définitivement (RGPD) l'ancien contact.
 */
export async function updateClientInMailjet(params: {
  oldEmail: string;
  nom: string;
  email: string;
  telephone: string;
  apiKey: string;
  apiSecret: string;
}): Promise<void> {
  const { oldEmail, nom, email, telephone, apiKey, apiSecret } = params;
  const mailjet = new Mailjet({ apiKey, apiSecret });
  const listId = getEnv("MAILJET_LIST_ID");
  const emailChanged = !!oldEmail && !!email && oldEmail.toLowerCase() !== email.toLowerCase();

  if (email) {
    // 1. Mettre à jour le nom (PUT) ; créer le contact en repli si absent (404)
    try {
      await (mailjet.put("contact", { version: "v3" }) as any)
        .id(email)
        .request({ Name: nom });
    } catch {
      await mailjet.post("contact", { version: "v3" }).request({
        Email: email,
        Name: nom,
        IsExcludedFromCampaigns: false,
      });
    }

    // 2. Téléphone + appartenance liste marketing (best-effort, ne doit pas
    //    casser la synchro d'identité si une propriété custom est invalide)
    if (listId) {
      try {
        await (mailjet.post("contactslist", { version: "v3" }) as any)
          .id(Number(listId))
          .action("managecontact")
          .request({
            Email: email,
            Action: "addnoforce",
            Properties: { firstname: nom.split(" ")[0], telephone },
          });
      } catch {
        // Propriété de liste invalide / contact déjà membre — non bloquant
      }
    }
  }

  // 3. Email changé : retirer définitivement l'ancien contact
  if (emailChanged) {
    const oldId = await getMailjetContactId(mailjet, oldEmail);
    if (oldId) {
      await hardDeleteMailjetContact(apiKey, apiSecret, oldId);
    }
  }
}

// ── Campagnes de relance par segment (marketing) ───────────────────────────

export interface SegmentCampaignClient {
  nom: string;
  email: string;
}

export interface SegmentCampaignResult {
  listId: number;
  listName: string;
  contactsAdded: number;
  contactsSkipped: number;
  campaignDraftId: number;
}

const SEGMENT_SUBJECTS: Record<"fideles" | "inactifs", { subject: string; title: string }> = {
  fideles: { subject: "Merci pour votre fidélité 🎮", title: "Relance fidèles" },
  inactifs: { subject: "On vous a manqué chez VR Café 👋", title: "Relance inactifs" },
};

/**
 * Crée une liste de contacts Mailjet dédiée à un segment (fidèles/inactifs),
 * y ajoute les clients fournis (email valide uniquement), puis crée un
 * brouillon de campagne ciblant cette liste. Best-effort sur l'ajout des
 * contacts individuels — un échec isolé n'interrompt pas le lot.
 */
export async function createSegmentCampaign(params: {
  segment: "fideles" | "inactifs";
  clients: SegmentCampaignClient[];
  apiKey: string;
  apiSecret: string;
  senderEmail: string;
}): Promise<SegmentCampaignResult> {
  const { segment, clients, apiKey, apiSecret, senderEmail } = params;
  const mailjet = new Mailjet({ apiKey, apiSecret });
  const { subject, title } = SEGMENT_SUBJECTS[segment];

  const validClients = clients.filter((c) => c.email && c.email.includes("@"));
  const skipped = clients.length - validClients.length;

  // 1. Créer la liste (nom unique : lisible + timestamp — Mailjet rejette les doublons de nom)
  const dateLabel = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const listName = `${title} ${dateLabel} ${Date.now()}`;
  const listRes: any = await mailjet.post("contactslist", { version: "v3" }).request({ Name: listName });
  const listId = Number(listRes?.body?.Data?.[0]?.ID);
  if (!listId) throw new Error("Échec de création de la liste Mailjet");

  // 2. Ajouter les contacts un par un (best-effort)
  let added = 0;
  for (const c of validClients) {
    try {
      await (mailjet.post("contactslist", { version: "v3" }) as any)
        .id(listId)
        .action("managecontact")
        .request({
          Email: c.email,
          Action: "addnoforce",
          Properties: { firstname: (c.nom || "").split(" ")[0] || "" },
        });
      added++;
    } catch {
      // contact déjà membre ailleurs / erreur isolée — non bloquant
    }
  }
  if (added === 0) throw new Error("Aucun contact n'a pu être ajouté à la liste Mailjet");

  // 3. Créer le brouillon de campagne ciblant cette liste
  const draftRes: any = await mailjet.post("campaigndraft", { version: "v3" }).request({
    Locale: "fr_FR",
    Sender: "VR Café",
    SenderEmail: senderEmail,
    Subject: subject,
    Title: `${title} — ${dateLabel}`,
    ContactsListID: listId,
  });
  const campaignDraftId = Number(draftRes?.body?.Data?.[0]?.ID);
  if (!campaignDraftId) throw new Error("Échec de création du brouillon de campagne Mailjet");

  return { listId, listName, contactsAdded: added, contactsSkipped: skipped, campaignDraftId };
}
