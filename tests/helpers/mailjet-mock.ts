// Faux client node-mailjet : enregistre chaque appel chaîné
// (post/get/put → id → action → request) sans rien envoyer.
export type MailjetCall = {
  method: "post" | "get" | "put";
  resource: string;
  version?: string;
  id?: unknown;
  action?: string;
  body?: any;
};

export function createMailjetMock() {
  const state = {
    calls: [] as MailjetCall[],
    // Réponse (ou exception) par appel ; par défaut { body: { Data: [] } }
    respond: (_call: MailjetCall): any => ({ body: { Data: [] } }),
  };

  class FakeMailjet {
    constructor(public config: { apiKey: string; apiSecret: string }) {}
    private chain(method: MailjetCall["method"], resource: string, opts?: { version?: string }) {
      const call: MailjetCall = { method, resource, version: opts?.version };
      const chain = {
        id(v: unknown) { call.id = v; return chain; },
        action(a: string) { call.action = a; return chain; },
        async request(body?: any) {
          call.body = body;
          state.calls.push(call);
          return state.respond(call);
        },
      };
      return chain;
    }
    post(r: string, o?: { version?: string }) { return this.chain("post", r, o); }
    get(r: string, o?: { version?: string }) { return this.chain("get", r, o); }
    put(r: string, o?: { version?: string }) { return this.chain("put", r, o); }
  }

  return { state, FakeMailjet };
}
