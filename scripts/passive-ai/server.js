// Run behind the same-origin web server. Bind only to loopback; credentials are provided per request.
import { createServer } from "node:http";
import { createAiRelay } from "./relay.js";
const allowedOrigin = process.env.PASSIVE_AI_ORIGIN;
if (!allowedOrigin)
    throw new Error("Set PASSIVE_AI_ORIGIN to the frontend origin (for example https://bf.example.com)");
const relay = createAiRelay({ allowedOrigin });
const server = createServer((req, res) =>
    relay(req, res, () => {
        res.writeHead(404);
        res.end();
    }),
);
server.listen(Number(process.env.PASSIVE_AI_PORT || 4182), "127.0.0.1");
