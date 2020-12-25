import { Document } from 'mongoose';

export interface IUser extends Document {
    name: string,
    password: string,
    salt: string,
    lastLogin: Date,
    twoFASecret?: string,
    createdAt?: Date
}