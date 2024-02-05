import mongoose from 'mongoose';

const gastoSchema = new mongoose.Schema(
  {
    descripcion: String,
    fecha: String,
    hora: String,
    monto: String,
  },
  { collection: 'Gastos' }
);

const Gasto = mongoose.model('Gasto', gastoSchema);

export default Gasto;
