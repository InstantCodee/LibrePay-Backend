import { Document } from 'mongoose';
import { CryptoUnits, FiatUnits, PaymentStatus } from '../../helper/types';

export interface ICart {
    price: number;
    name: string;
    image: string;
    quantity: number;
}

export interface IPaymentMethod {
    method: CryptoUnits;
    amount: number;
    exRate: number;
}

export interface IInvoice extends Document {
    selector: string;
    
    // Available payment methods
    // { method: 'btc', amount: 0.0000105 }
    paymentMethods: IPaymentMethod[];

    // This is the method choosen by the user
    paymentMethod?: CryptoUnits;

    // Will be created as soon as the user picked one options
    // 1Kss3e9iPB9vTgWJJZ1SZNkkFKcFJXPz9t
    receiveAddress?: string;

    /** This payment ID is **only available if Monero has been used**. */
    paymentId?: string;

    // Is set when invoice got paid
    // 3b38c3a215d4e7981e1516b2dcbf76fca58911274d5d55b3d615274d6e10f2c1
    transcationHash?: string;

    // (virtual field) Holds a link to a block explorer
    transactionLink?: string | null;

    // Is provided when transaction is unconfirmed
    confirmation?: number;

    cart?: ICart[];
    totalPrice?: number;
    currency: FiatUnits;
    
    // Datetime the user has to pay.
    dueBy: Date;

    status?: PaymentStatus;

    // E-Mail address of user, if he want's a confirmation email.
    email?: string;

    successUrl: string;
    cancelUrl: string;
    failUrl: string;
    redirectTo: string;

    createdAt?: number;
}