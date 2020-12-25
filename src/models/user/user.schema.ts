import { Schema } from 'mongoose';

const schemaUser = new Schema({
    name: { type: String, required: true },
    password: { type: String, required: true },
    salt: { type: String, required: true },
    twoFASecret: { type: String, required: false },
    lastLogin: { type: Date, required: true, default: Date.now },
}, {
    timestamps: {
        createdAt: true
    }
});

export { schemaUser }