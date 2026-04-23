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
