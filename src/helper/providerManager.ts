import { readdirSync } from 'fs';
import { join } from 'path';
import { invoiceManager, logger } from '../app';
import { BackendProvider } from './backendProvider';
import { CryptoUnits } from './types';

export class ProviderManager {

    providerFilePath: string;
    cryptoProvider: Map<CryptoUnits, BackendProvider>;

    constructor(filePath: string) {
        this.providerFilePath = filePath;
        this.cryptoProvider = new Map<CryptoUnits, BackendProvider>();
    }

    getProvider(crypto: CryptoUnits): BackendProvider | undefined {
        return this.cryptoProvider.get(crypto);
    }

    /**
     * Scan & load all found providers
     */
    scan() {
        const getDirectories = () =>
            readdirSync(this.providerFilePath, { withFileTypes: true })
                .filter(dirent => dirent.name.endsWith('.ts'))
                .map(dirent => dirent.name)

        getDirectories().forEach(file => {
            const absolutePath = join(this.providerFilePath, file);
            const providerModule = require(absolutePath);
            const provider = new providerModule.Provider() as BackendProvider;
            
            if (this.cryptoProvider.has(provider.CRYPTO)) {
                logger.warn(`Provider ${provider.NAME} will be ignored since there is already another provider active for ${provider.CRYPTO}!`);
                return;
            }

            this.cryptoProvider.set(provider.CRYPTO, provider);
            
            // Execute onEnable() function of this provider
            provider.onEnable();

            logger.info(`Loaded provider ${provider.NAME} by ${provider.AUTHOR} (${provider.VERSION}) for ${provider.CRYPTO}`);
        });
    }

}