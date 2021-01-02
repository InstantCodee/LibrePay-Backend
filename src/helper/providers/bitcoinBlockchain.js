import { BackendProvider } from "../backendProvider";
import { CryptoUnits } from "../types";

export class Provider implements BackendProvider {

    NAME = 'Bitcoin Blockchain';
    DESCRIPTION = 'This provider queries the API backend provider by blockchain.com';
    AUTHOR = 'LibrePay Team';
    VERSION = '0.1'
    CRYPTO = CryptoUnits.BITCOIN;

}