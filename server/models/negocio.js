import mongoose from 'mongoose';

const NegocioSchema = new mongoose.Schema(
  {
    name: String,
    direccion: String,
    numero: {
      info: String,
      state: Boolean,
    },
    estado: Boolean,
    horario: {
      dias: [],
      horas: {
        inicio: String,
        fin: String,
      },
    },
  },
  { collection: 'Negocio' }
);

const Negocio = mongoose.model('Negocio', NegocioSchema);

export default Negocio;
