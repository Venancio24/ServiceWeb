import mongoose from 'mongoose';

const cuadreDiarioSchema = new mongoose.Schema(
  {
    dateCuadre: {},
    Montos: [],
    cajaInicial: String,
    cajaFinal: String,
    corte: String,
    notas: [],
  },
  { collection: 'CuadreDiario' }
);

const CuadreDiario = mongoose.model('CuadreDiario', cuadreDiarioSchema);

export default CuadreDiario;
