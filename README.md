# LibrePay
Next-gen payment processor for cryptocurrencies.

**LibrePay is still in an early development stage and therefore should not be used in production.**

## 1. Goal
**You might ask yourself: Why does this project exist? Isn't there already BitPay, CoinPayments or CoinGate?**

Well yes, those services work completly fine if you want to accept crypto in your shop and the fees these services want are acceptable for the most people.

So why using LibrePay then? Some people want to have there service completly independent of others, which includes payment providers. While you can't really do this for traditional fiat currencies you can definitly do this for cryptocurrencies since everyone in the network can participate in it.

### 1.1. LibrePay in a nutshell
* Complete independence of others
* Avoiding additional fees
* Transparent service since LibrePay is completly FOSS
* Customize it to your heart's desires
* A crypto currency is not supported yet? It's fairly easy to implement a new one.

## 1.2. Installation
The installation will be possible in two ways:
1. Clone this repository, setup your database server & crypto wallets **(hard)**
2. Use an isolated docker container with almost no setup required **(recommended)**

### 1.2.1. Manual install
1. Clone this repository using Git CLI, any Git GUI or via the download button on GitHub.
2. Install the latest LTS version from Node.js (tested on 15.10.0)
3. Setup a MongoDB server or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
4. Run `npm install` inside this project folder
5. Create the following `.env` file:
```txt
DEBUG=false
MONGO_URI=mongodb://USERNAME:PASSWORD@HOST/librepay
JWT_SECRET=RANDOM_STRING
INVOICE_SECRET=RANDOM_STRING

MONERO_ZMQ_ADDRESS=tcp://127.0.0.1:38086
MONERO_WALLET_PASSWORD=WALLET_PASSWORD
MONERO_WALLET_NAME=WALLET_NAME
MONERO_WALLET_ACCOUNT_INDEX=0
```
**Note:** This environment file has to be changed and must contain all your credentials.

6. Now run the LibrePay with `npm start`

All that is left to do now is to install the [offical frontend](https://github.com/InstantCodee/LibrePay-Frontend/tree/master). Feel free to use any alternative if there is any.

### 1.2.2. Docker install
A offical docker image is **coming soon**.

### 2. Crypto providers
LibrePay makes it very easy for others to implement there own cryptocurrency. You miss one? Maybe an online or offline version of a currency? Just add it yourself or ask us if you're unfamiliar with programming.

### 2.1. Setup
All installed crypto providers can be found under `src/helper/providers/`. If you want to add your own, just create a file with any name but with `.ts` as suffix.

Inside of this file, implement the following skeleton:
```ts
// Your imports go here ...

export class Provider implements BackendProvider {

    // These read-only constant are required and identify your provider.
    NAME = 'Hello World';
    DESCRIPTION = 'This provider communicates with the Hello World Core application.';
    AUTHOR = 'C-137';
    VERSION = '0.1';
    CRYPTO = [CryptoUnits.BITCOIN];

    onEnable() {
        return new Promise<void>((resolve, reject) => {
            console.log('Hello World!');
            resolve();
        });
    }

    // Missing methods have to be implemented here ...
}
```
Make sure you **don't change the class name** from `Provider` to something else or LibrePay will not load your provider.

### 2.2. Implementing the logic
After pasting this skeleton into your IDE you will notice that most of the functions are missing. That's because the `BackendProvider` class defines a lot more functions. Take a look into `src/helper/backendProvider.ts` (or click [here](https://github.com/InstantCodee/LibrePay-Backend/blob/master/src/helper/backendProvider.ts)) and you'll find the missing functions with there definition and explaination. 

We've already showed you our small `onEnable()` function which has to be a promise. Most functions have to be one. What you usually do in this method is to check & validate environment variables and to connection to any servers if required.

If you need an example, just take a look into our implementation with the Bitcoin Core RPC interface under `src/helper/providers/bitcoinCore.ts`.

### 2.3. Publishing
You fell that your new provider is finished? Well that's good to hear!

Before you make your pull request, make sure you tested everything well and it's production ready. If that's done you can create a new pull request in our GitHub repository and we'll have a look at your code. Once we reviewed your code and there is nothing else to be added, we'll merge your changes and your new provider will be supported in the next release.

**We would like to ask you not to try to add any new dependencies to the project.** If something can be easily implemented by yourself, do it and don't use any new dependency. Thank you.