import { NativeError, Schema, SchemaTypes } from 'mongoose';
import { CryptoUnits, FiatUnits, PaymentStatus } from '../../helper/types';
import { IInvoice } from './invoice.interface';

const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/

const schemaCart = new Schema({
    price: { type: Number, required: true },
    name: { type: String, trim: true, required: true },
    image: { type: String, match: urlRegex, required: true },
    quantity: { type: Number, default: 1 }
})

const schemaInvoice = new Schema({
    paymentMethods: [{ type: String, enum: Object.values(CryptoUnits), default: [CryptoUnits.BITCOIN], required: true }],
    receiveAddress: { type: String, required: true },
    paidWith: { type: String, enum: CryptoUnits },
    transcationHash: { type: String, required: false },
    cart: [{ type: schemaCart, required: false }],
    totalPrice: { type: Number, required: false },
    currency: { type: String, enum: Object.values(FiatUnits), required: false },
    dueBy: { type: Number, required: true },
    status: { type: Number, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING },
    email: { type: String, required: false },
    successUrl: { type: String, match: urlRegex, required: false },
    cancelUrl: { type: String, match: urlRegex, required: false }
}, {
    timestamps: {
        createdAt: true,
    },
    versionKey: false
});

// Validate values
schemaInvoice.post('validate', function (res, next) {
    let self = this as IInvoice;
    
    // If cart is undefined and price too, error.
    if ((self.cart === undefined || self.cart.length === 0) && self.totalPrice === undefined) {
        next(new Error('Either cart or price has to be defined!'));
        return;
    }

    // If cart is provided, calculate price.
    if (self.cart !== undefined && self.totalPrice === undefined) {
        let totalPrice = 0;
        
        for (let i = 0; i < self.cart.length; i++) {
            const item = self.cart[i];
            totalPrice += item.price * item.quantity;
        }

        self.set({ totalPrice });
    }
    next();
})

export { schemaInvoice }