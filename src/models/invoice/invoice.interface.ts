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
    amount: number
}

export interface IInvoice extends Document {
    selector: string;
    
    // Available payment methods
    // [{ method: 'btc', amount: 0.0000105 }]
    paymentMethods: IPaymentMethod[];

    // 1Kss3e9iPB9vTgWJJZ1SZNkkFKcFJXPz9t
    receiveAddress: string;

    paidWith?: CryptoUnits;

    // Already paid amount, in case that not the entire amount was paid with once.
    // 0.000013
    paid?: number;

    // Is set when invoice got paid
    // 3b38c3a215d4e7981e1516b2dcbf76fca58911274d5d55b3d615274d6e10f2c1
    transcationHashes?: string[];

    cart?: ICart[];
    totalPrice?: number;
    currency: FiatUnits;
    
    // Time in minutes the user has to pay.
    // Time left = (createdAt + dueBy) - Date.now() / 1000
    dueBy: number;

    status?: PaymentStatus;

    // E-Mail address of user, if he want's a confirmation email.
    email?: string;

    successUrl: string;
    cancelUrl: string;

    createdAt?: number;
}