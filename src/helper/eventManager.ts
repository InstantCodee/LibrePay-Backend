import { Response } from "express";
import { logger } from "../app";
import { BiMap } from "./lib/bidirectionalmap";

export class EventManager {
    // This map stores a open data stream and it's associated room.
    private connections = new BiMap<Response, string>();

    /**
     * Add a client to a specific room
     * @param selector Used as an id for the specific room
     * @param stream A open connection to the user
     */
    join(selector: string, stream: Response) {
        // Make sure to keep the connection open
        stream.writeHead(200, {
            'Content-Type':     'text/event-stream',
            'Cache-Control':    'no-cache',
            'Connection':       'keep-alive'
        });

        this.connections.set(stream, selector);
        logger.debug(`Client ${stream.req.hostname} joined room ${selector}`);
    }

    /**
     * Push a new event into a specific room
     * @param event Type of the event
     * @param data Content of the event
     * @param selector Room to push in. If empty then it will be a public broadcast to anyone
     */
    push(event: string, data: any, selector?: string) {
        const clients = this.getStreamsBySelector(selector)
        
        clients.forEach(client => {
            client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        });
        logger.debug(`Broadcasted event ${event} to room ${selector} (${clients.length} members) clients`);
    }

    /**
     * End the communication with a specific client.
     */
    end(stream: Response) {
        stream.end();
        this.connections.deleteKey(stream);
        logger.debug(`End connection with ${stream.req.hostname}`);
    }

    /**
     * End all connections associated with a specific room.
     */
    endAll(selector: string) {
        this.getStreamsBySelector(selector).forEach(client => this.end(client));
    }

    getStreamsBySelector(selector: string): Response[] {
        let streams = [];
        this.connections.forEach((value, key) => {
            if (value === selector) streams.push(key);
        });

        return streams;
    }
}