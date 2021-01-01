import { Schema } from 'mongoose';
import { socketManager } from '../../app';
import { CryptoUnits, FiatUnits, PaymentStatus } from '../../helper/types';
import { ICart, IInvoice } from './invoice.interface';

const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/

const schemaCart = new Schema({
    price: { type: Number, required: true },
    name: { type: String, trim: true, required: true },
    image: { type: String, match: urlRegex, required: true },
    quantity: { type: Number, default: 1 }
}, { _id: false });

const schemaPaymentMethods = new Schema({
    method: { type: String, enum: Object.values(CryptoUnits), required: true },
    amount: { type: Number, required: false }
}, { _id: false });

const schemaInvoice = new Schema({
    selector: { type: String, length: 128, required: true },
    paymentMethods: [{ type: schemaPaymentMethods, required: true }],
    paymentMethod: { type: String, enum: Object.values(CryptoUnits), required: false },
    receiveAddress: { type: String, required: false },
    transcationHash: { type: String, required: false },
    cart: [{ type: schemaCart, required: false }],
    totalPrice: { type: Number, required: false },
    currency: { type: String, enum: Object.values(FiatUnits), required: true },
    dueBy: { type: Date, required: true },
    status: { type: Number, enum: Object.values(PaymentStatus), default: PaymentStatus.REQUESTED },
    email: { type: String, required: false },
    successUrl: { type: String, match: urlRegex, required: false },
    cancelUrl: { type: String, match: urlRegex, required: false }
}, {
    timestamps: {
        createdAt: true,
    },
    versionKey: false
});

schemaInvoice.pre('validate', function(next) {
    let self = this as IInvoice;
    self.currency = FiatUnits[self.currency];

    next();
});

// Validate values
schemaInvoice.post('validate', function (doc, next) {
    let self = this as IInvoice;
    
    // If cart is undefined and price too, error.
    if ((self.cart === undefined || self.cart.length === 0) && self.totalPrice === undefined) {
        next(new Error('Either cart or price has to be defined!'));
        return;
    }
    
    next();
});

function updateStatus(doc: IInvoice, next) {
    socketManager.emitInvoiceEvent(doc, 'status', doc.status);
    next();
}

schemaInvoice.post('save', updateStatus);

export function calculateCart(cart: ICart[]): number {
    let totalPrice = 0;
    
    for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        totalPrice += item.price * item.quantity;
    }

    return totalPrice;
}

export { schemaInvoice }