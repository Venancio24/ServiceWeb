import mongoose from 'mongoose';

const anularSchema = new mongoose.Schema(
  {
    _id: String, // Campo personalizado para el ID
    motivo: String,
    fecha: String,
    hora: String,
  },
  { collection: 'Anulados' }
);

const Anular = mongoose.model('Anular', anularSchema);

export default Anular;
