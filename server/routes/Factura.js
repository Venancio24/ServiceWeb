import express from 'express';
import Factura from '../models/Factura.js';
import { openingHours } from '../middleware/middleware.js';
import codFactura from '../models/codigoFactura.js';
import Delivery from '../models/delivery.js';
import clientes from '../models/clientes.js';
import Cupones from '../models/cupones.js';
import db from '../config/db.js';
import moment from 'moment';
import Almacen from '../models/almacen.js';
import Anular from '../models/anular.js';
import Donacion from '../models/donacion.js';
import { reportePrendas } from '../utils/varsGlobal.js';

const router = express.Router();

const createPuntosObj = (res, points) => {
  const {
    dateRecepcion: dateService,
    codRecibo: codigo,
    _id: idOrdenService,
    dni: dni,
    Nombre: nombre,
    celular: phone,
  } = res;

  const filter = {
    dni: dni,
  };

  const update = {
    $set: {
      nombre,
      phone,
    },
    $push: {
      infoScore: {
        idOrdenService,
        codigo,
        dateService,
        score: points,
      },
    },
    $inc: {
      scoreTotal: points,
    },
  };

  return { filter, update };
};

router.post('/add-factura', openingHours, async (req, res) => {
  const session = await db.startSession();
  session.startTransaction(); // Comienza una transacción
  try {
    const { infoRecibo } = req.body;
    const {
      codRecibo,
      dateRecepcion,
      Modalidad,
      Nombre,
      Producto,
      celular,
      Pago,
      ListPago,
      datePrevista,
      dateEntrega,
      metodoPago,
      descuento,
      estadoPrenda,
      estado,
      dni,
      subTotal,
      totalNeto,
      cargosExtras,
      factura,
      modeRegistro,
      modoDescuento,
      gift_promo,
      attendedBy,
      lastEdit,
      typeRegistro,
    } = infoRecibo;

    // Consultar el último registro ordenado por el campo 'index' de forma descendente
    const ultimoRegistro = await Factura.findOne().sort({ index: -1 }).exec();

    // Obtener el último índice utilizado o establecer 0 si no hay registros
    const ultimoIndice = ultimoRegistro ? ultimoRegistro.index : 0;

    // Crear el nuevo índice incrementando el último índice en 1
    const nuevoIndice = ultimoIndice + 1;

    let updatedCod;
    if (modeRegistro === 'nuevo') {
      // Tu lógica para actualizar el código de factura
      updatedCod = await codFactura.findOneAndUpdate({}, { $inc: { codActual: 1 } }, { new: true, session: session });

      if (updatedCod) {
        if (updatedCod.codActual > updatedCod.codFinal) {
          updatedCod.codActual = 1;
          await updatedCod.save({ session: session });
        }
      } else {
        return res.status(404).json({ mensaje: 'Código de factura no encontrado' });
      }
    }

    // Crear el nuevo registro con el índice asignado
    const nuevoDato = new Factura({
      codRecibo,
      dateRecepcion,
      Modalidad,
      Nombre,
      Producto,
      celular,
      Pago,
      ListPago,
      datePrevista,
      dateEntrega,
      metodoPago,
      descuento,
      estadoPrenda,
      estado,
      index: nuevoIndice,
      dni,
      subTotal,
      totalNeto,
      cargosExtras,
      factura,
      modeRegistro,
      notas: [],
      modoDescuento,
      gift_promo,
      location: 1,
      attendedBy,
      lastEdit,
      typeRegistro,
    });

    // Guardar el nuevo registro en la base de datos
    const fSaved = await nuevoDato.save({ session: session });
    const facturaGuardada = fSaved.toObject();

    let newDelivery;
    if (Modalidad === 'Delivery' && modeRegistro === 'nuevo') {
      const { infoDelivery } = req.body;
      const { name, descripcion, fecha, hora, monto } = infoDelivery;

      newDelivery = new Delivery({
        idCliente: facturaGuardada._id,
        name,
        descripcion,
        fecha,
        hora,
        monto,
      });

      await newDelivery.save({ session: session });
    }

    if (facturaGuardada.gift_promo.length > 0) {
      for (const gift of facturaGuardada.gift_promo) {
        const codigoPromocion = gift.codigoPromocion;
        const codigoCupon = gift.codigoCupon;

        // Crear el nuevo cupón en la base de datos
        const nuevoCupon = new Cupones({
          codigoPromocion,
          codigoCupon,
          estado: true, // Por defecto, el estado es true
          dateCreation: {
            fecha: moment().format('YYYY-MM-DD'),
            hora: moment().format('HH:mm'),
          },
          dateUse: {
            fecha: '',
            hora: '',
          },
        });

        await nuevoCupon.save({ session: session });
      }
    }

    const beneficios = facturaGuardada.cargosExtras.beneficios;
    if (facturaGuardada.modoDescuento === 'Puntos' && beneficios.puntos > 0 && facturaGuardada.dni !== '') {
      // Si la orden esta siendo usado en el cliente osea registrado
      const ordenUsada = await clientes.findOne({
        dni: facturaGuardada.dni,
        'infoScore.idOrdenService': facturaGuardada._id,
      });

      // si no a sido registrado  pues aplicar puntos
      if (!ordenUsada) {
        // si uso puntos es que hay cliente
        const puntosToDeduct = createPuntosObj(facturaGuardada, -beneficios.puntos); // reducir puntos al cliente

        const { filter, update } = puntosToDeduct;

        await clientes.updateOne(filter, update, { upsert: true, session: session });
      }
    }

    if (facturaGuardada.modoDescuento === 'Promocion' && beneficios.promociones.length > 0) {
      for (const cup of beneficios.promociones) {
        const codigoCupon = cup.codigoCupon;

        // Buscar el cupón por su código
        const cupon = await Cupones.findOne({ codigoCupon });

        // Actualizar el estado del cupón a false
        cupon.estado = false;

        // Registrar la fecha y hora actual en el campo dateUse
        cupon.dateUse.fecha = moment().format('YYYY-MM-DD');
        cupon.dateUse.hora = moment().format('HH:mm');

        // Guardar los cambios en la base de datos
        await cupon.save({ session: session });
      }
    }

    res.json({
      newOrder: {
        ...facturaGuardada,
        donationDate: {
          fecha: '',
          hora: '',
        },
      },
      ...(Modalidad === 'Delivery' && modeRegistro === 'nuevo' && { newDelivery }),
      ...(modeRegistro === 'nuevo' && { newCodigo: updatedCod.codActual }),
    });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al guardar los datos:', error);
    res.status(500).json({ mensaje: 'Error al guardar los datos' });
  }
});

router.get('/get-factura', (req, res) => {
  Factura.find()
    .then((facturas) => {
      res.json(facturas);
    })
    .catch((error) => {
      console.error('Error al obtener los datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener los datos' });
    });
});

router.get('/get-factura/:id', (req, res) => {
  const { id } = req.params; // Obteniendo el id desde los parámetros de la URL
  Factura.findById(id)
    .then((factura) => {
      if (factura) {
        res.json(factura);
      } else {
        res.status(404).json({ mensaje: 'Factura no encontrada' });
      }
    })
    .catch((error) => {
      console.error('Error al obtener los datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener los datos' });
    });
});

router.get('/get-factura/date/:datePago', (req, res) => {
  const { datePago } = req.params;

  Factura.find({ 'ListPago.date.fecha': datePago })
    .then((facturas) => {
      // Filtrar y mapear los resultados para incluir sólo los documentos que coincidan en la fecha de pago.
      const facturasConPagoCorrespondiente = facturas.filter((factura) =>
        factura.ListPago.some((pago) => pago.date.fecha === datePago)
      );

      res.json(facturasConPagoCorrespondiente);
    })
    .catch((error) => {
      console.error('Error al obtener los datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener los datos' });
    });
});

router.get('/get-factura/date/:startDate/:endDate', async (req, res) => {
  const { startDate, endDate } = req.params;

  try {
    // Obtén todas las facturas en el rango de fechas
    const facturas = await Factura.find({
      'dateRecepcion.fecha': {
        $gte: startDate,
        $lte: endDate,
      },
    });

    // Array para almacenar los resultados finales
    const resultados = [];
    const donacionRegistros = await Donacion.find();
    // Itera a través de las facturas
    for (const factura of facturas) {
      // Verifica condiciones para buscar en Donacion
      if (factura.location === 3 && factura.estadoPrenda === 'donado') {
        // Busca en la colección Donacion
        let donationDate;
        // Itera a través de los registros de Almacen
        for (const donated of donacionRegistros) {
          // Itera a través de los serviceOrder del registro de Almacen
          for (const serviceOrderId of donated.serviceOrder) {
            if (serviceOrderId === factura._id.toString()) {
              // Encuentra la factura correspondiente a serviceOrderId
              donationDate = donated.donationDate;
              break; // Si se encontró la factura, puedes salir del bucle
            }
          }

          if (donationDate) {
            resultados.push({
              ...factura.toObject(),
              donationDate,
            });
            break;
          }
        }
      } else {
        // Si no cumple con las condiciones, agrega la factura con donationDate vacío
        resultados.push({
          ...factura.toObject(),
          donationDate: {
            fecha: '',
            hora: '',
          },
        });
      }
    }

    res.status(200).json(resultados);
  } catch (error) {
    console.error('Error al obtener datos: ', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
});

const generateDateArray = (type, filter) => {
  let fechas = [];

  if (type === 'daily') {
    const { days } = filter;
    // Generar fechas para los próximos 3 días
    fechas = Array.from({ length: days }, (_, index) =>
      moment().startOf('day').add(index, 'days').format('YYYY-MM-DD')
    );
    return fechas;
  } else {
    if (type === 'monthly') {
      const { date } = filter;
      // Generar fechas para todo el mes
      const firstDayOfMonth = moment(date).startOf('month');
      const lastDayOfMonth = moment(date).endOf('month');

      let currentDate = moment(firstDayOfMonth);
      while (currentDate <= lastDayOfMonth) {
        fechas.push(currentDate.format('YYYY-MM-DD'));
        currentDate.add(1, 'day');
      }
      return fechas;
    }
  }
};

router.post('/get-report/date-prevista/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const filter = req.body;
    const datesArray = generateDateArray(type, filter);
    const infoReporte = [];

    for (const datePrevista of datesArray) {
      const facturas = await Factura.find({
        'datePrevista.fecha': datePrevista,
        estadoPrenda: { $nin: ['anulado', 'donado'] },
      });

      const resultado = {
        FechaPrevista: datePrevista,
        CantidadPedido: facturas.length,
        InfoProducto: facturas.reduce((productos, factura) => {
          factura.Producto.forEach(({ producto, cantidad }) => {
            if (reportePrendas.includes(producto)) {
              productos[producto] = (productos[producto] || 0) + Number(cantidad);
            }
          });
          return productos;
        }, {}),
      };

      resultado.InfoProducto = Object.entries(resultado.InfoProducto).map(([Producto, Cantidad]) => ({
        Producto,
        Cantidad,
      }));

      // Asegurarse de que todos los productos deseados estén representados
      reportePrendas.forEach((producto) => {
        if (!resultado.InfoProducto.some((p) => p.Producto === producto)) {
          resultado.InfoProducto.push({ Producto: producto, Cantidad: 0 });
        }
      });

      infoReporte.push(resultado);
    }

    res.json(infoReporte);
  } catch (error) {
    console.error('Error al obtener los datos:', error);
    res.status(500).json({ mensaje: 'Error al obtener los datos' });
  }
});

router.put('/update-factura/:id', openingHours, async (req, res) => {
  const session = await db.startSession();
  session.startTransaction(); // Comienza una transacción

  try {
    const facturaId = req.params.id;
    const { infoRecibo } = req.body;

    Factura.findById(facturaId)
      .then((factura) => {
        if (!factura) {
          return res.status(404).json({ mensaje: 'Factura no encontrada' });
        }

        const orderInicial = factura;

        // Crea un objeto con los campos y valores actualizados
        const orderToUpdate = {};

        // Itera a través de los campos existentes en la factura y actualiza si se proporcionan en req.body
        for (const field in orderInicial.toObject()) {
          if (infoRecibo.hasOwnProperty(field)) {
            orderToUpdate[field] = infoRecibo[field];
          } else {
            orderToUpdate[field] = infoRecibo[field];
          }
        }

        // Actualiza los campos en la base de datos
        Factura.findOneAndUpdate({ _id: facturaId }, { $set: orderToUpdate }, { new: true, session: session })
          .then(async (uOrder) => {
            const orderUpdated = uOrder.toObject();
            let updateDelivery;

            // let newAnulacion;
            if (orderUpdated.estadoPrenda === 'anulado') {
              const { infoAnulacion } = req.body;

              const nuevaAnulacion = new Anular(infoAnulacion);

              await nuevaAnulacion
                .save({ session: session })
                .then(async (anulado) => {
                  // newAnulacion = anulado;

                  if (orderUpdated.dni) {
                    // una vez anulado - eliminar puntaje de orden de servicio
                    const idOrderEliminada = anulado._id;

                    const cliente = await clientes.findOne({ dni: orderUpdated.dni });

                    if (cliente) {
                      cliente.infoScore = cliente.infoScore.filter((info) => info.idOrdenService !== idOrderEliminada);

                      cliente.scoreTotal = cliente.infoScore
                        .reduce((total, info) => total + parseInt(info.score, 10), 0)
                        .toString();
                      await cliente.save({ session: session });
                    }
                  }
                })
                .catch((error) => {
                  console.error('Error al anular cliente:', error);
                  res.status(500).json({ mensaje: 'Error al anular cliente:' });
                });
            }

            if (orderUpdated.estadoPrenda === 'pendiente' && orderUpdated.Modalidad === 'Delivery') {
              await Delivery.findOneAndUpdate(
                { idCliente: facturaId },
                { $set: { name: orderUpdated.Nombre } },
                { new: true, session: session }
              )
                .then((deliveryActualuzado) => {
                  updateDelivery = deliveryActualuzado.toObject();
                })
                .catch((error) => {
                  console.error('Error al Actualizar Nombre de Delivery:', error);
                  res.status(500).json({ mensaje: 'Error al Actualizar Nombre de Deliveryy' });
                });

              // Asegurar que se Registren las promociones como (cupones)
              if (orderUpdated.gift_promo.length > 0) {
                const ListPromos = orderUpdated.gift_promo;
                await Promise.all(
                  ListPromos.map(async (promo) => {
                    const codigoCupon = promo.codigoCupon;
                    const exist = await Cupones.findOne({ codigoCupon });

                    if (!exist) {
                      const codigoPromocion = promo.codigoPromocion;
                      // Crear el nuevo cupón en la base de datos
                      const nuevoCupon = new Cupones({
                        codigoPromocion,
                        codigoCupon,
                        estado: true, // Por defecto, el estado es true
                        dateCreation: {
                          fecha: moment().format('YYYY-MM-DD'),
                          hora: moment().format('HH:mm'),
                        },
                        dateUse: {
                          fecha: '',
                          hora: '',
                        },
                      });

                      await nuevoCupon.save({ session: session });
                    }
                  })
                );
              }

              const beneficios = orderUpdated.cargosExtras.beneficios;
              if (orderUpdated.modoDescuento === 'Puntos' && beneficios.puntos > 0 && orderUpdated.dni !== '') {
                // Si la orden esta estan usado en cliento osea registrado
                const ordenUsada = await clientes.findOne({
                  dni: orderUpdated.dni,
                  'infoScore.idOrdenService': orderUpdated._id,
                });

                // si no a sido registrado  pues aplicar puntos
                if (!ordenUsada) {
                  const puntosToDeduct = createPuntosObj(orderUpdated, -beneficios.puntos); // reducir puntos a erse cliente
                  const { filter, update } = puntosToDeduct;
                  await clientes.updateOne(filter, update, { upsert: true, session: session });
                }
              }

              // Asegurar que los Cupones se usen
              if (orderUpdated.modoDescuento === 'Promocion' && beneficios.promociones.length > 0) {
                const ListPromos = beneficios.promociones;
                await Promise.all(
                  ListPromos.map(async (promo) => {
                    const codigoCupon = promo.codigoCupon;
                    const cupon = await Cupones.findOne({ codigoCupon });

                    if (cupon.estado === true) {
                      cupon.estado = false;

                      // Registrar la fecha y hora actual en el campo dateUse
                      (cupon.dateUse.fecha = moment().format('YYYY-MM-DD')),
                        (cupon.dateUse.hora = moment().format('HH:mm')),
                        // Guardar los cambios en la base de datos
                        await cupon.save({ session: session });
                    }
                  })
                );
              }
            }

            if (
              orderUpdated.Pago === 'Completo' &&
              orderUpdated.estadoPrenda === 'entregado' &&
              orderUpdated.dni !== ''
            ) {
              const score = parseInt(orderUpdated.totalNeto);
              const puntosObj = createPuntosObj(orderUpdated, score);
              const { filter, update } = puntosObj;
              await clientes.updateOne(filter, update, { upsert: true, session: session });
            }

            if (orderUpdated.location === 1 && orderInicial.location === 2) {
              await Almacen.updateMany(
                { serviceOrder: orderUpdated._id },
                { $pull: { serviceOrder: orderUpdated._id } },
                { session: session }
              );
            }

            let newDelivery;
            if (
              orderUpdated.Modalidad === 'Delivery' &&
              orderInicial.estadoPrenda === 'pendiente' &&
              orderUpdated.estadoPrenda === 'entregado'
            ) {
              const { infoDelivery } = req.body;
              const { name, descripcion, fecha, hora, monto } = infoDelivery;

              const nuevoDelivery = new Delivery({
                idCliente: orderUpdated._id,
                name,
                descripcion,
                fecha,
                hora,
                monto,
              });

              await nuevoDelivery
                .save({ session: session })
                .then((deliveryGuardado) => {
                  newDelivery = deliveryGuardado.toObject();
                })
                .catch((error) => {
                  console.error('Error al Guardar Delivery:', error);
                  res.status(500).json({ mensaje: 'Error al Guardar Delivery' });
                });
            }

            res.json({
              orderUpdated: {
                ...orderUpdated,
                donationDate: {
                  fecha: '',
                  hora: '',
                },
              },
              // ...(orderUpdated.estadoPrenda === 'anulado' && { newAnulacion }),
              ...(orderUpdated.estadoPrenda === 'pendiente' &&
                orderUpdated.Modalidad === 'Delivery' && { updateDelivery }),
              ...(orderUpdated.Modalidad === 'Delivery' &&
                orderInicial.estadoPrenda === 'pendiente' &&
                orderUpdated.estadoPrenda === 'entregado' && { newDelivery }),
            });
          })
          .catch((error) => {
            console.error('Error al actualizar la factura:', error);
            res.status(500).json({ mensaje: 'Error al actualizar la factura' });
          });
      })
      .catch((error) => {
        console.error('Error Ordern no Encontrada:', error);
        res.status(500).json({ mensaje: 'Error Ordern no Encontrada' });
      });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al actualizar los datos de la orden:', error);
    res.status(500).json({ mensaje: 'Error al actualizar los datos de la orden' });
  }
});

router.post('/cancel-entrega/:id', async (req, res) => {
  const session = await db.startSession();
  session.startTransaction(); // Comienza una transacción

  try {
    const facturaId = req.params.id;

    // Obtener factura por ID
    const factura = await Factura.findById(facturaId);
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const fechaActual = moment().format('YYYY-MM-DD');
    let idDeliveryDeleted;
    if (factura.estadoPrenda === 'entregado' && factura.dateEntrega.fecha === fechaActual) {
      if (factura.Modalidad === 'Delivery') {
        // Buscar deliveries relacionados y eliminar los de devolución

        const deliveries = await Delivery.find({ idCliente: factura._id }).session(session);
        for (const delivery of deliveries) {
          if (delivery.descripcion.includes('Devolucion') && delivery.fecha === factura.dateEntrega.fecha) {
            idDeliveryDeleted = delivery._id;
            await Delivery.findOneAndDelete({ _id: delivery._id }, { session: session });
          }
        }
      }

      // Actualizar cliente si tiene DNI
      if (factura.dni !== '') {
        const cliente = await clientes.findOne({ dni: factura.dni }).session(session);
        if (cliente) {
          // Actualizar cliente y sus infoScore
          const facturaIdString = factura._id.toString();

          const updatedInfoScore = cliente.infoScore.filter((score) => score.idOrdenService !== facturaIdString);

          // Actualizar el scoreTotal del cliente
          cliente.infoScore = updatedInfoScore;
          cliente.scoreTotal = cliente.infoScore.reduce((total, score) => total + parseInt(score.score), 0);

          await cliente.save({ session: session });
        }
      }
      const orderUpdate = await Factura.findOneAndUpdate(
        { _id: facturaId },
        {
          estadoPrenda: 'pendiente',
          dateEntrega: {
            fecha: '',
            hora: '',
          },
        },
        { new: true, session: session }
      );

      res.json({
        orderUpdate: orderUpdate.toObject(),
        ...(idDeliveryDeleted && factura.Modalidad === 'Delivery' && { idDeliveryDeleted: idDeliveryDeleted }),
      });
      await session.commitTransaction();
    } else {
      res.status(404).json({ mensaje: 'No cumple con los parametros para cancelar entrega' });
    }
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    res.status(500).json({ mensaje: 'Error al cancelar Entrega' });
  }
});

export default router;
