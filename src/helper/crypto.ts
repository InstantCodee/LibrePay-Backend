import { hash, verify } from 'argon2';
import { config } from '../../config';
import { IS_DEBUG, logger } from '../app';

export async function hashPassword(input: string): Promise<string> {
    const start = Date.now();

    return new Promise<string>(async (resolve, reject) => {
        // Get real password (remove salt and pepper)
        const realPassword = input.substring(0, input.length - config.authentification.salt_length - 1);
        if (!check_password_requirements(realPassword)) {
            if (!IS_DEBUG) reject("This password does not meet the minimum requirements!");
            else {
                reject(`This password does not meet the minimum requirements! (${input} => ${realPassword})`);
            }
            return;
        }

        try {
            const hashed = await hash(input, {
                hashLength: 42,
                memoryCost: 1024*32,
                parallelism: 2,
                timeCost: config.authentification.argonTimecost
            });
            const finished = Date.now();
            logger.debug("Hashing took " + (finished-start) + "ms to finish! " + input);
            resolve(hashed);
        } catch(err) {
            reject(err);
        }
    });
}

/**
 * Verfiy If given password matches with provided hash by brute forcing the pepper.
 * @param password Password with salt appended
 * @param hashInput Hash from database
 */
export async function verifyPassword(password: string, hashInput: string): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
        const start = Date.now();
        const peppers = config.authentification.pepper.split('');
        const realPassword = password.substring(0, password.length - config.authentification.salt_length);

        while (peppers.length !== 0) {
            const pepper = peppers[Math.floor(Math.random() * peppers.length)];
            if (IS_DEBUG) {
                logger.debug(`Try ${password}}${pepper} (left: ${peppers})`);
            } else {
                // Show censored password (with fixed length) in non-debug mode to prevent password leaking.
                logger.debug(`Try ********${password.replace(realPassword, '')}${pepper} (left: ${peppers})`);
            }
            if (await verify(hashInput, password + pepper)) {
                const finished = Date.now();
                logger.debug("Verifying took " + (finished - start) + "ms to complete!");
                resolve(true);
                return;
            } else {
                peppers.splice(peppers.indexOf(pepper), 1);
            }
        }
        resolve(false);
    });
}

export function randomString(length: number): string {
    let result           = '';
    const characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export function randomPepper(): string {
    return config.authentification.pepper.charAt(Math.floor(Math.random() * config.authentification.pepper.length));
}

/**
 * Requirements are:
 *  - at least 8 characters
 *  - min one upper-, lowercase- and special character
 *  - min one number
 */
export function check_password_requirements(password: string): boolean {
    // Check for length
    if (password.length < config.authentification.minPasswordLength ||
        password.length > config.authentification.maxPasswordLength) return false;

    // Check for one lowercase
    if (!(/^(?=.*[a-z]).+$/.test(password))) return false;

    // Check for one uppercase
    if (!(/^(?=.*[A-Z]).+$/.test(password))) return false;

    // Check for one uppercase
    if (!(/^(?=.*[0-9]).+$/.test(password))) return false;

    // Check for special characters
    if (!(/[^A-Za-z0-9]/.test(password))) return false;

    return true;
}