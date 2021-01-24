import { readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../../config';
import { invoiceManager, logger, providerManager } from '../app';
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

            provider.CRYPTO.forEach(crypto => {
                if (this.cryptoProvider.has(crypto)) {
                    logger.warn(`Provider ${provider.NAME} will be ignored since there is already another provider active for ${provider.CRYPTO}!`);
                    return;
                }
    
                this.cryptoProvider.set(crypto, provider);
                config.payment.methods.push(crypto);
            });

            // Execute onEnable() function of this provider
            const startUp = provider.onEnable();
            if (!startUp) {
                logger.error(`Provider "${provider.NAME}" by ${provider.AUTHOR} (${provider.VERSION}) failed to start! (check previous logs)`);
                return;
            }

            logger.info(`Loaded provider "${provider.NAME}" by ${provider.AUTHOR} (${provider.VERSION}) for ${provider.CRYPTO.join(', ')}`);
        });
    }

    /**
     * This provider will be no longer be used.
     */
    disable(name: string) {
        this.cryptoProvider.forEach(provider => {
            if (provider.NAME === name) {
                // Disable all coins that are supported by this provider.
                provider.CRYPTO.forEach(crypto => {
                    this.cryptoProvider.delete(crypto);
                });
                logger.warning(`Provider "${provider.NAME}" is now disabled.`);
            }
        });
    }

}