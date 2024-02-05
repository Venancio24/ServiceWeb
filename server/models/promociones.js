import mongoose from 'mongoose';

const PromocionesSchema = new mongoose.Schema(
  {
    codigo: String,
    prenda: { type: mongoose.Schema.Types.Mixed, required: true }, // Puede ser String o Array
    cantidadMin: Number,
    tipoDescuento: String,
    tipoPromocion: String,
    descripcion: String,
    descuento: Number,
    vigencia: Number,
    state: Boolean,
  },
  { collection: 'Promocion' }
);

const Promocion = mongoose.model('Promocion', PromocionesSchema);

export default Promocion;
