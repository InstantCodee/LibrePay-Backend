import { Request } from "express";
import { IUser } from "../models/user/user.interface";

export interface LibrePayRequest extends Request {
    user?: IUser
}