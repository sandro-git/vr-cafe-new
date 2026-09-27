import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_MAX_AGE,
  checkAdminPassword,
  createAdminSession,
  isAdminRequest,
  verifyAdminSession,
  type AdminEnv,
} from "../netlify/lib/admin-session";

const ENV: AdminEnv = { ADMIN_PASSWORD: "mot-de-passe-test", ADMIN_SESSION_SECRET: "secret-session-test" };
const NOW = Date.UTC(2026, 8, 27, 10, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

async function token(env = ENV, now = NOW) {
  const t = await createAdminSession(env, now);
  expect(t).not.toBeNull();
  return t!;
}

describe("admin-session : jeton", () => {
  it("ne contient pas le mot de passe ni le secret", async () => {
    const t = await token();
    expect(t).toMatch(/^v1\.\d+\.\d+\.[A-Za-z0-9_-]+$/);
    expect(t).not.toContain(ENV.ADMIN_PASSWORD);
    expect(t).not.toContain(ENV.ADMIN_SESSION_SECRET);
  });

  it("accepte un jeton valide, jusqu'à la fin des 30 jours", async () => {
    const t = await token();
    expect(await verifyAdminSession(t, ENV, NOW)).toBe(true);
    expect(await verifyAdminSession(t, ENV, NOW + 29 * DAY)).toBe(true);
  });

  it("refuse un jeton expiré", async () => {
    const t = await token();
    expect(await verifyAdminSession(t, ENV, NOW + ADMIN_SESSION_MAX_AGE * 1000)).toBe(false);
    expect(await verifyAdminSession(t, ENV, NOW + 31 * DAY)).toBe(false);
  });

  it("refuse un jeton émis dans le futur", async () => {
    const t = await token(ENV, NOW + DAY);
    expect(await verifyAdminSession(t, ENV, NOW)).toBe(false);
  });

  it("refuse un jeton falsifié", async () => {
    const t = await token();
    const [v, iat, exp, sig] = t.split(".");
    // Expiration repoussée sans re-signer
    const later = String(Number(exp) + 365 * 86400);
    expect(await verifyAdminSession([v, iat, later, sig].join("."), ENV, NOW)).toBe(false);
    expect(await verifyAdminSession([v, String(Number(iat) + 1), String(Number(exp) + 1), sig].join("."), ENV, NOW)).toBe(false);
    // Signature modifiée d'un caractère
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await verifyAdminSession([v, iat, exp, flipped].join("."), ENV, NOW)).toBe(false);
    // Formats invalides, dont l'ancien cookie (mot de passe en clair)
    for (const bad of ["", "v1", `v2.${iat}.${exp}.${sig}`, `${t}.x`, `v1.${iat}.${exp}.${sig}!`, ENV.ADMIN_PASSWORD!]) {
      expect(await verifyAdminSession(bad, ENV, NOW)).toBe(false);
    }
    expect(await verifyAdminSession(null, ENV, NOW)).toBe(false);
  });

  it("refuse le jeton si le secret de session ou le mot de passe change", async () => {
    const t = await token();
    expect(await verifyAdminSession(t, { ...ENV, ADMIN_SESSION_SECRET: "autre-secret" }, NOW)).toBe(false);
    expect(await verifyAdminSession(t, { ...ENV, ADMIN_PASSWORD: "autre-mot-de-passe" }, NOW)).toBe(false);
    expect(await verifyAdminSession(t, { ADMIN_PASSWORD: ENV.ADMIN_PASSWORD }, NOW)).toBe(false);
  });

  it("sans ADMIN_SESSION_SECRET : repli sur une clé dérivée de ADMIN_PASSWORD", async () => {
    const env = { ADMIN_PASSWORD: ENV.ADMIN_PASSWORD };
    const t = await token(env);
    expect(t).not.toContain(env.ADMIN_PASSWORD);
    expect(await verifyAdminSession(t, env, NOW)).toBe(true);
  });

  it("sans ADMIN_PASSWORD : aucune session créée ni acceptée", async () => {
    const t = await token();
    expect(await createAdminSession({ ADMIN_SESSION_SECRET: "x" }, NOW)).toBeNull();
    expect(await verifyAdminSession(t, { ADMIN_SESSION_SECRET: ENV.ADMIN_SESSION_SECRET }, NOW)).toBe(false);
  });
});

describe("admin-session : requêtes et mot de passe", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const req = (cookie?: string) => new Request("https://vr-cafe.fr/api/admin-db", { headers: cookie ? { cookie } : {} });

  it("lit le cookie admin_session de la requête (variables d'environnement par défaut)", async () => {
    process.env.ADMIN_PASSWORD = ENV.ADMIN_PASSWORD;
    process.env.ADMIN_SESSION_SECRET = ENV.ADMIN_SESSION_SECRET;
    const t = await token(ENV, Date.now());
    expect(await isAdminRequest(req(`theme=dark; admin_session=${encodeURIComponent(t)}; autre=1`))).toBe(true);
    expect(await isAdminRequest(req(`admin_session=${ENV.ADMIN_PASSWORD}`))).toBe(false);
    expect(await isAdminRequest(req("fake_admin_session=x"))).toBe(false);
    expect(await isAdminRequest(req("admin_session=%E0%A4%A"))).toBe(false);
    expect(await isAdminRequest(req())).toBe(false);
  });

  it("vérifie le mot de passe saisi", async () => {
    expect(await checkAdminPassword(ENV.ADMIN_PASSWORD!, ENV)).toBe(true);
    expect(await checkAdminPassword("mauvais", ENV)).toBe(false);
    expect(await checkAdminPassword("", ENV)).toBe(false);
    expect(await checkAdminPassword(ENV.ADMIN_PASSWORD + "x", ENV)).toBe(false);
    expect(await checkAdminPassword("", {})).toBe(false);
  });
});
