import { Model, model } from 'mongoose';
import { IInvoice } from './invoice.interface';
import { schemaInvoice } from './invoice.schema';

const modelInvoice: Model<IInvoice> = model<IInvoice>('Invoice', schemaInvoice , 'Invoice');
export { modelInvoice as Invoice };