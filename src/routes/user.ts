import { Router } from "express";
import { MW_User, loginUser, getUser } from "../controllers/user";

const userRouter = Router()

userRouter.get('/login', loginUser);
userRouter.get('/', MW_User, getUser);
userRouter.get('/:id', MW_User, getUser);

export { userRouter };