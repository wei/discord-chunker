export default {
  async fetch(request: Request): Promise<Response> {
    return new Response("discord-chunker is running", { status: 200 });
  },
};
