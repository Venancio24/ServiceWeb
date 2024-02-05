import express from 'express';
import Factura from '../models/Factura.js';
import Gasto from '../models/gastos.js';
import moment from 'moment';
import 'moment-timezone';
import { reportePrendas } from '../utils/varsGlobal.js';

const router = express.Router();

function getWeeks(firstDayOfMonth, firstSundayOfMonth) {
  let startDate = firstSundayOfMonth.clone().add(1, 'day');
  const semanas = [
    {
      fechaInicial: firstDayOfMonth.format('YYYY-MM-DD'),
      fechaFinal: firstSundayOfMonth.format('YYYY-MM-DD'),
    },
  ];

  while (startDate.month() === firstDayOfMonth.month()) {
    let endDate = startDate.clone().day(7); // Sábado de la semana

    if (endDate.isAfter(firstDayOfMonth.clone().endOf('month'))) {
      endDate = firstDayOfMonth.clone().endOf('month'); // Último día del mes
    }

    semanas.push({
      fechaInicial: startDate.format('YYYY-MM-DD'),
      fechaFinal: endDate.format('YYYY-MM-DD'),
    });

    startDate = endDate.clone().add(1, 'day'); // Siguiente día al sábado
  }

  return semanas;
}
async function getProductQuantities(query) {
  const productsData = {};
  const categorias = reportePrendas;

  const facturasInRange = await Factura.find(query);

  for (const categoria of categorias) {
    let totalCantidad = 0;

    for (const factura of facturasInRange) {
      for (const producto of factura.Producto) {
        if (producto.categoria === categoria) {
          totalCantidad += parseInt(producto.cantidad); // Asumiendo que la cantidad es un número
        }
      }
    }

    productsData[categoria] = totalCantidad;
  }

  return productsData;
}
//
router.get('/get-reporte', async (req, res) => {
  const { mes, anio } = req.query;
  try {
    const firstDayOfMonth = moment(`${anio}-${mes}-01`);
    const firstSundayOfMonth = firstDayOfMonth.clone().day(0).add(1, 'week'); // Primer domingo del mes

    const semanas = getWeeks(firstDayOfMonth, firstSundayOfMonth);

    for (const semana of semanas) {
      const query = {
        'dateRecepcion.fecha': {
          $gte: semana.fechaInicial,
          $lte: semana.fechaFinal,
        },
      };

      const productsData = await getProductQuantities(query);
      semana.productos = productsData;
    }
    res.json(semanas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

router.get('/get-reporte-mensual', async (req, res) => {
  const { mes, anio } = req.query;

  // Validar que los parámetros mes y anio sean válidos
  if (!mes || !anio) {
    return res.status(400).json({ mensaje: 'Los parámetros mes y año son requeridos.' });
  }

  try {
    // Construir fechas de inicio y fin del mes
    const fechaInicial = moment(`${anio}-${mes}-01`, 'YYYY-MM');
    const fechaFinal = fechaInicial.clone().endOf('month');

    // Consultar facturas en ese rango de fechas y con estadoPrenda no anulado
    const facturas = await Factura.find({
      'dateRecepcion.fecha': {
        $gte: fechaInicial.format('YYYY-MM-DD'),
        $lte: fechaFinal.format('YYYY-MM-DD'),
      },
      estadoPrenda: { $ne: 'anulado' }, // EstadoPrenda debe ser distinto de "anulado"
    });

    res.json([...facturas]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo Generar reporte EXCEL' });
  }
});

router.get('/get-reporte-anual', async (req, res) => {
  const { anio } = req.query;

  // Validar que el parámetro anio sea válido
  if (!anio) {
    return res.status(400).json({ error: 'El parámetro anio es requerido.' });
  }

  try {
    // Crear un array para almacenar los resultados por mes
    const reporteAnual = [];

    for (let mes = 1; mes <= 12; mes++) {
      const fechaInicial = moment(`${anio}-${mes}-01`, 'YYYY-MM-DD');
      const fechaFinal = fechaInicial.clone().endOf('month');

      // Consultar facturas en ese rango de fechas
      const facturas = await Factura.find({
        'dateRecepcion.fecha': {
          $gte: fechaInicial.format('YYYY-MM-DD'),
          $lte: fechaFinal.format('YYYY-MM-DD'),
        },
      });

      // Contar la cantidad de registros para cada Modalidad
      const conteoTienda = facturas.filter((factura) => factura.Modalidad === 'Tienda').length;
      const conteoDelivery = facturas.filter((factura) => factura.Modalidad === 'Delivery').length;

      // Agregar los resultados al array de reporteAnual
      reporteAnual.push({
        mes: mes, // Puedes cambiar esto si prefieres nombres de mes en lugar de números
        tienda: conteoTienda,
        delivery: conteoDelivery,
      });
    }

    res.json(reporteAnual);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Función para calcular la diferencia en días entre dos fechas
function dayDifference(fecha1, fecha2) {
  const momentFecha1 = moment(fecha1, 'YYYY-MM-DD');
  const momentFecha2 = moment(fecha2, 'YYYY-MM-DD');
  return momentFecha2.diff(momentFecha1, 'days');
}

router.get('/get-reporte-pendientes', async (req, res) => {
  try {
    // Obtener la fecha actual en formato "YYYY-MM-DD"
    const fechaActual = moment().format('YYYY-MM-DD HH:mm:ss');

    // Consultar facturas que cumplan con las condiciones
    const facturas = await Factura.find({
      estadoPrenda: 'pendiente',
      estado: 'registrado',
      location: 1,
    });

    // Filtrar las facturas que cumplen con la diferencia de días
    const facturasPendientes = facturas.filter((factura) => {
      const dDifference = dayDifference(factura.dateRecepcion.fecha, fechaActual);
      return dDifference > -1;
    });

    res.json(facturasPendientes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo obtener lista de ordenes pendientes' });
  }
});

router.get('/get-reporte-gasto', async (req, res) => {
  const { mes, anio } = req.query;

  // Validar que los parámetros mes y anio sean válidos
  if (!mes || !anio) {
    return res.status(400).json({ mensaje: 'Los parámetros mes y año son requeridos.' });
  }

  try {
    // Construir fechas de inicio y fin del mes
    const fechaInicial = moment(`${anio}-${mes}-01`, 'YYYY-MM');
    const fechaFinal = fechaInicial.clone().endOf('month');

    // Consultar facturas en ese rango de fechas y con estadoPrenda no anulado
    const gastos = await Gasto.find({
      fecha: {
        $gte: fechaInicial.format('YYYY-MM-DD'),
        $lte: fechaFinal.format('YYYY-MM-DD'),
      },
    });

    res.json([...gastos]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No se pudo Generar reporte EXCEL' });
  }
});

export default router;
