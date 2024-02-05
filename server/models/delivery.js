import mongoose from 'mongoose';

const deliverySchema = new mongoose.Schema({
  idCliente: String, // Campo personalizado para el ID
  name: String,
  descripcion: String, // Corregido: descipcion -> descripcion
  fecha: String,
  hora: String,
  monto: String,
});

const Delivery = mongoose.model('Delivery', deliverySchema);

export default Delivery;
