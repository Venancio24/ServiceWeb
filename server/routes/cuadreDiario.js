import express from 'express';
import CuadreDiario from '../models/cuadreDiario.js';
import moment from 'moment';

import { openingHours } from '../middleware/middleware.js';
const router = express.Router();

router.post('/save-cuadre', openingHours, (req, res) => {
  const { infoCuadre } = req.body;
  const { dateCuadre, Montos, cajaInicial, cajaFinal, corte, notas } = infoCuadre;

  CuadreDiario.findOne({ 'dateCuadre.fecha': dateCuadre.fecha }) // Buscar un registro con la fecha proporcionada
    .then((cuadreExistente) => {
      if (cuadreExistente) {
        // Si existe un registro con la misma fecha, actualizar los valores
        cuadreExistente.Montos = Montos;
        cuadreExistente.cajaInicial = cajaInicial;
        cuadreExistente.cajaFinal = cajaFinal;
        cuadreExistente.corte = corte;
        cuadreExistente.notas = notas;

        cuadreExistente
          .save()
          .then((cuadreActualizado) => {
            res.json(cuadreActualizado);
          })
          .catch((error) => {
            console.error('Error al actualizar los datos:', error);
            res.status(500).json({ mensaje: 'Error al actualizar los datos' });
          });
      } else {
        // Si no existe un registro con la misma fecha, crear uno nuevo
        const nuevoCuadre = new CuadreDiario({
          dateCuadre,
          Montos,
          cajaInicial,
          cajaFinal,
          corte,
          notas,
        });

        nuevoCuadre
          .save()
          .then((cuadreGuardado) => {
            res.json(cuadreGuardado);
          })
          .catch((error) => {
            console.error('Error al guardar los datos:', error);
            res.status(500).json({ mensaje: 'Error al guardar los datos' });
          });
      }
    })
    .catch((error) => {
      console.error('Error al buscar los datos:', error);
      res.status(500).json({ mensaje: 'Error al buscar los datos' });
    });
});

router.get('/get-cuadre/date/:dateCuadre', (req, res) => {
  const { dateCuadre } = req.params;

  CuadreDiario.findOne({ 'dateCuadre.fecha': dateCuadre })
    .then((cuadre) => {
      if (cuadre) {
        res.json(cuadre);
      } else {
        res.json(null);
      }
    })
    .catch((error) => {
      console.error('Error al obtener el dato:', error);
      res.status(500).json({ mensaje: 'Error al obtener el dato' });
    });
});

router.get('/get-cuadre/last', async (req, res) => {
  try {
    // Obtener la fecha actual utilizando moment
    const currentDate = moment();

    // Buscar la fecha registrada menor o igual a la fecha actual
    const lastCuadre = await CuadreDiario.findOne({
      'dateCuadre.fecha': { $lte: currentDate.format('YYYY-MM-DD') },
    })
      .sort({ 'dateCuadre.fecha': -1 }) // Ordenar por fecha de forma descendente
      .limit(1) // Limitar el resultado a un solo documento
      .exec();

    if (lastCuadre) {
      res.json(lastCuadre);
    } else {
      res.json({
        dateCuadre: {
          fecha: currentDate.format('YYYY-MM-DD'),
          hora: '',
        },
        Montos: [
          { monto: 100, cantidad: '', total: 0 },
          { monto: 50, cantidad: '', total: 0 },
          { monto: 20, cantidad: '', total: 0 },
          { monto: 10, cantidad: '', total: 0 },
          { monto: 5, cantidad: '', total: 0 },
          { monto: 2, cantidad: '', total: 0 },
          { monto: 1, cantidad: '', total: 0 },
          { monto: 0.5, cantidad: '', total: 0 },
          { monto: 0.2, cantidad: '', total: 0 },
          { monto: 0.1, cantidad: '', total: 0 },
        ],
        cajaInicial: '0',
        cajaFinal: '0',
        corte: '0',
        notas: [],
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener el cuadre.' });
  }
});

export default router;
