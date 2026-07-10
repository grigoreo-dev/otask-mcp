export default {
  async fetch(): Promise<Response> {
    return new Response("otask-mcp worker scaffold", { status: 200 });
  },
};
