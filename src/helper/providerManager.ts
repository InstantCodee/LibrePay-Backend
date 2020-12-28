import { readdirSync } from 'fs';

export class ProviderManager {

    providerFilePath: string;

    constructor(filePath: string) {
        this.providerFilePath = filePath;
    }

    scan() {
        const getDirectories = () =>
            readdirSync(this.providerFilePath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name)

        console.log(getDirectories());
    }

}