import { AfterLoad, Column, Entity, PrimaryColumn } from "typeorm";
import { CryptoUnits, FiatUnits, PaymentStatus } from "../helper/types";

@Entity()
export class Invoice {

    @PrimaryColumn()
    id: number;

    // Available payment methods
    // btc,xmr,eth,doge
    @Column({ type: 'text' })
    paymentMethods: CryptoUnits[];

    // 1Kss3e9iPB9vTgWJJZ1SZNkkFKcFJXPz9t
    @Column()
    receiveAddress: string;

    @Column()
    paidWith: CryptoUnits;

    // Is set when invoice got paid
    // 3b38c3a215d4e7981e1516b2dcbf76fca58911274d5d55b3d615274d6e10f2c1
    @Column({ nullable: true })
    transcationHash: string;

    @Column({ type: 'varchar' })
    priceUnit: FiatUnits;

    @Column({ type: 'float' })
    price: number;

    @Column()
    dueBy: number;

    @Column({ type: 'smallint' })
    status: PaymentStatus;

    @Column({ nullable: true })
    email: string;

    @Column({ type: 'timestamp' })
    createdAt: number;

    @AfterLoad()
    convertPayments() {
        if (this.paymentMethods !== undefined) {
            /*const arr = this.paymentMethods.split(',');
            let final: CryptoUnits[];

            arr.forEach(elem => {
                final.push(CryptoUnits[elem.toUpperCase()]);
            });*/
        }
    }

}