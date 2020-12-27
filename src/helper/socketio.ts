import { Server, Socket } from "socket.io";
import { logger } from "../app";
import { IInvoice } from "../models/invoice/invoice.interface";
import { Invoice } from "../models/invoice/invoice.model";
import { PaymentStatus } from "./types";

export class SocketManager {
    io: Server;
    
    private socketInvoice: Map<string, string>; // Socket ID / _id
    private idSocket: Map<string, Socket>;      // Socket ID / Socket
    private invoiceSocket: Map<string, Socket>; // _id / Socket

    constructor(io: Server) {
        this.io = io;
        this.socketInvoice = new Map<string, string>();
        this.idSocket = new Map<string, Socket>();
        this.invoiceSocket = new Map<string, Socket>();
        this.listen();
    }

    listen() {
        console.log("Listen");
        
        this.io.on('connection', (socket: Socket) => {
            this.idSocket.set(socket.id, socket);

            // The frontend sends his selector, then pick _id and put it in `socketInvoice` map.
            // Return `true` if successful and `false` if not.
            socket.on('subscribe', async data => {
                if (data.selector !== undefined) {
                    const invoice = await Invoice.findOne({ selector: data.selector });
                    if (invoice === null) {
                        socket.emit('subscribe', false);
                        return;
                    }

                    logger.info(`Socket ${socket.id} has subscribed to invoice ${invoice.id} (${PaymentStatus[invoice.status]})`);
                    
                    this.socketInvoice.set(socket.id, invoice.id);
                    this.invoiceSocket.set(invoice.id, socket);
                    socket.emit('subscribe', true);
                }
            });
        });
    }

    getSocketById(id: string) {
        return this.idSocket.get(id);
    }

    async getInvoiceBySocket(socketId: string) {
        const invoiceId = this.socketInvoice.get(socketId);
        return await Invoice.findById(invoiceId);
    }

    getSocketByInvoice(invoice: IInvoice) {
        return this.invoiceSocket.get(invoice.id);
    }
}