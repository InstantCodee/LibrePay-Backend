/**
 * Here you can change various settings like database credentials, http settings and more.
 * 
 * Debug mode and MongoDB credentials are set via enviroment variables for security reasons.
 */
export const config: IConfig = {
    authentification: {
        pepper: 'J3%_zö\\^',
        salt_length: 8,
        argonTimecost: 8,
        minPasswordLength: 4,
        maxPasswordLength: 150
    },
    http: {
        port: 2009,
        host: "0.0.0.0"
    }
}
/**
 * END OF CONFIG
 * ====================
 */


export interface IConfig {
    authentification: {
        pepper: string,
        salt_length: number,
        argonTimecost: number,
        minPasswordLength: number,
        maxPasswordLength: number
    },
    http: {
        port: number,
        host: string
    }
}