import mongoose from 'mongoose';

const usuarioSchema = new mongoose.Schema(
  {
    usuario: String,
    contraseña: String,
    rol: String,
    name: String,
    email: String,
    phone: String,
    _validate: Boolean,
  },
  { collection: 'Usuarios' }
);

const Usuarios = mongoose.model('Usuarios', usuarioSchema);

export default Usuarios;
