import { Model, model } from 'mongoose';
import { IUser } from "./user.interface";
import { schemaUser } from './user.schema';

const modelUser: Model<IUser> = model<IUser>('User', schemaUser , 'User');
export { modelUser as User };