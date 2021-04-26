import { Request, Response } from 'express';
import { decode, sign, verify } from 'jsonwebtoken';

import { JWT_SECRET, logger } from '../app';
import * as jwt from 'jsonwebtoken';
import { config } from '../../config';
import { hashPassword, randomPepper, randomString, verifyPassword } from '../helper/crypto';
import { User } from '../models/user/user.model';
import { LibrePayRequest } from '../helper/request';

export async function getUser(req: LibrePayRequest, res: Response) {
    let user: any = req.params.id === undefined ? req.user : await User.findById(req.params.id);

    if (user === null) {
        res.status(404).send();
        return;
    }

    user.password = undefined;
    user.salt = undefined;
    user.__v = undefined;

    res.status(200).send(user);
}

export async function createUser(req: LibrePayRequest, res: Response) {
    const name = req.body.name;
    const password = req.body.password;
    const type = req.body.type;

    if (name === undefined || password === undefined || type === undefined) {
        res.status(400).send();
        return;
    }

    if (await User.countDocuments({ name }) === 1) {
        res.status(409).send();
        return;
    }

    const salt = randomString(config.authentification.salt_length);
    const hashedPassword = await hashPassword(password + salt + randomPepper()).catch(error => {
        res.status(400).send({ message: 'Provided password is too weak and cannot be used.' });
        return;
    }) as string;    

    const newUser = await User.create({
        name,
        password: hashedPassword,
        salt,
        lastLogin: new Date(0)
    });

    // Create setup token that the new user can use to change his password.
    const setupToken = jwt.sign({ setupForUser: newUser._id }, JWT_SECRET, { expiresIn: '1d' });

    res.status(200).send({ setupToken });
}

export async function DeleteUser(req: Request, res: Response) {
    
}

export async function PatchUser(req: Request, res: Response) {
    
}

export async function loginUser(req: Request, res: Response) {
    const username = req.body.username;
    const password = req.body.password;
    const twoFA = req.body.twoFA;

    const user = await User.findOne({ name: username });

    // Check if user exists
    if (user == undefined) {
        setTimeout(() => {
            res.status(401).send({ message: "Either the username or password is wrong." });
        }, Math.random() * 1500 + 400);
        return;
    }

    // Check if 2FA is turned on (the attacker doesn't know if the password is wrong yet)
    if (user.twoFASecret != undefined) {
        if (twoFA == undefined) {
            res.status(401).send({ message: "2FA code is required." });
            return;
        }
        // TODO: Implement 2FA logic here
    }

    // Check if password is wrong
    if (!await verifyPassword(password + user.salt, user.password)) {
        res.status(404).send({ message: 'Either the username or password is wrong.' });
        return;
    }

    // We're good. Create JWT token.
    const token = sign({ user: user._id }, JWT_SECRET, { expiresIn: '30d' });

    user.lastLogin = new Date(Date.now());
    await user.save();

    logger.info(`User ${user.name} logged in.`)
    res.status(200).send({ token });
}

/**
 * This middleware validates any tokens that are required to access most of the endpoints.
 * Note: This validation doesn't contain any permission checking. 
 */
export async function MW_User(req: LibrePayRequest, res: Response, next: () => void) {
    if (req.headers.token === undefined) {
        res.status(401).send({ message: "Token not specified" });
        return;
    }
    const token = req.headers.token.toString();

    try {
        // Verify token
        if(await verify(token, JWT_SECRET, { algorithms: ['HS256'] })) {
            // Token is valid, now look if user is in db (in case he got deleted)
            const id = decode(token, { json: true })!.user;
            const db = await User.findById(id);

            if (db !== undefined && db !== null) {
                req.user = db
                next();
                return;
            } else {
                res.status(401).send({ message: "Token is not valid" });
            }
        } else {
            res.status(401).send({ message: "Token is not valid" });
        }
    } catch (err) {
        if (err) {
            if (err === "jwt expired") {
                res.status(401).send({ message: "Your token expired" });
                return;
            }
            res.status(500).send({ message: "We failed validating your token for some reason." });
            logger.error(err);
        }
    }
}