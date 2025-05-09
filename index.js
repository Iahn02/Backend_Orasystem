const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const sql = require('mssql');

const app = express();
// Puerto para Vercel (usa process.env.PORT si está disponible, de lo contrario usa 3001)
const PORT = process.env.PORT || 3001;

// Middleware para registrar la IP del cliente en cada solicitud
app.use((req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress;
  console.log(`Solicitud recibida desde IP: ${clientIP}`);
  next();
});

// Debug de variables de entorno (sin mostrar la contraseña completa)
console.log('=== CONFIGURACIÓN DE ENTORNO ===');
console.log(`Puerto: ${PORT}`);
console.log(`EMAIL_USER: ${'servicio@orasystem.cl'}`);
console.log(`EMAIL_PASS configurado: Sí (valor oculto)`);
console.log(`EMAIL_TO: ${'comercial@orasystem.cl'}`);
console.log(`DB_SERVER: ${'seguridad.database.windows.net'}`);
console.log(`DB_NAME: ${'SeguridadBD'}`);
console.log('===============================');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.')); // Sirve archivos estáticos desde la raíz

// Configuración de la base de datos SQL Server
const dbConfig = {
  server: 'seguridad.database.windows.net',
  database: 'SeguridadBD',
  user: 'orasystem',
  password: 'admin123.',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    port: 1433
  }
};

// Configuración del transporte de correo
console.log('Configurando transporte de correo...');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'servicio@orasystem.cl',
    pass: 'uxwu evwz ecxr hmoa'
  },
  debug: true // Activar modo debug de nodemailer
});

// Verificar conexión al servidor de correo
transporter.verify()
  .then(() => {
    console.log('✅ Conexión al servidor de correo verificada correctamente');
  })
  .catch((error) => {
    console.error('❌ Error al verificar la conexión al servidor de correo:');
    console.error(`Código: ${error.code}`);
    console.error(`Mensaje: ${error.message}`);
    if (error.response) {
      console.error(`Respuesta del servidor: ${error.response}`);
    }
  });

// Función para conectar a la base de datos con manejo de errores
const connectToDatabase = async () => {
  try {
    console.log('Intentando conectar a la base de datos...');
    await sql.connect(dbConfig);
    console.log('✅ Conexión a la base de datos SQL Server establecida correctamente');
    
    // Verificar si existe la tabla y crearla si no existe
    return await sql.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Formularios]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[Formularios] (
          [Id] INT IDENTITY(1,1) PRIMARY KEY,
          [Nombre] NVARCHAR(100) NOT NULL,
          [Email] NVARCHAR(100) NOT NULL,
          [Mensaje] NVARCHAR(MAX) NOT NULL,
          [FechaRegistro] DATETIME DEFAULT GETDATE()
        )
        PRINT 'Tabla Formularios creada correctamente'
      END
      ELSE
      BEGIN
        PRINT 'La tabla Formularios ya existe'
      END
    `);
  } catch (error) {
    console.error('❌ Error al conectar con la base de datos:');
    console.error(`Tipo de error: ${error.name}`);
    console.error(`Mensaje: ${error.message}`);
    console.error('Este error no detendrá el servidor, pero la funcionalidad de base de datos no estará disponible');
    return null;
  }
};

// Intentar la conexión inicial a la base de datos
connectToDatabase()
  .then(result => {
    if (result) {
      console.log('Resultado de la verificación de tabla:', result);
    }
  })
  .catch(err => {
    console.error('Error en la conexión inicial a la base de datos:', err);
  });

// Ruta para el formulario
app.post('/api/formulario', async (req, res) => {
  console.log('📨 Recibida petición POST a /api/formulario');
  console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
  
  try {
    const { name, email, message } = req.body;
    
    // Validación básica
    if (!name || !email || !message) {
      console.log('❌ Validación fallida: Datos incompletos');
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son obligatorios' 
      });
    }

    console.log('✅ Validación de datos correcta');
    
    // Guardar en la base de datos
    console.log('Intentando guardar datos en la base de datos...');
    try {
      const pool = await sql.connect(dbConfig);
      const result = await pool.request()
        .input('nombre', sql.NVarChar, name)
        .input('email', sql.NVarChar, email)
        .input('mensaje', sql.NVarChar, message)
        .query(`
          INSERT INTO [dbo].[Formularios] 
            ([Nombre], [Email], [Mensaje]) 
          VALUES 
            (@nombre, @email, @mensaje);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      const insertedId = result.recordset[0].id;
      console.log(`✅ Datos guardados correctamente en la base de datos con ID: ${insertedId}`);
    } catch (dbError) {
      console.error('❌ Error al guardar en la base de datos:');
      console.error(`Mensaje: ${dbError.message}`);
      console.error('Continuando con el envío de correo...');
    }
    
    // Plantilla HTML para el correo
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 650px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
          }
          .header {
            background-color: #e73c30;
            color: #ffffff;
            padding: 25px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 30px;
          }
          .field {
            margin-bottom: 25px;
            border-bottom: 1px solid #eee;
            padding-bottom: 15px;
          }
          .field:last-child {
            border-bottom: none;
            margin-bottom: 0;
          }
          .label {
            font-weight: 600;
            color: #e73c30;
            margin-bottom: 5px;
            font-size: 16px;
          }
          .value {
            margin: 0;
            font-size: 16px;
            color: #212121;
          }
          .footer {
            background-color: #f1f1f1;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #666;
          }
          .logo {
            margin-bottom: 15px;
          }
          .logo img {
            max-width: 200px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Solicitud de Consultoría</h1>
          </div>
          <div class="content">
            <p>Se ha recibido una nueva solicitud de información de un cliente potencial a través del formulario de contacto del sitio web corporativo.</p>
            
            <div class="field">
              <p class="label">Nombre del solicitante:</p>
              <p class="value">${name}</p>
            </div>
            <div class="field">
              <p class="label">Correo electrónico de contacto:</p>
              <p class="value">${email}</p>
            </div>
            <div class="field">
              <p class="label">Mensaje:</p>
              <p class="value">${message}</p>
            </div>
          </div>
          <div class="footer">
            <p>ORASYSTEM - Especialistas en Consultoría & Administración IT</p>
            <p>Este mensaje ha sido generado automáticamente. Por favor, no responda directamente a este correo.</p>
            <p>© ${new Date().getFullYear()} Orasystem. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Configuración del correo
    console.log('Preparando opciones de correo...');
    const mailOptions = {
      from: 'servicio@orasystem.cl',
      to: 'comercial@orasystem.cl',
      subject: 'Nueva Solicitud de Consultoría - Formulario Web',
      html: htmlTemplate
    };
    
    console.log(`De: ${mailOptions.from}`);
    console.log(`Para: ${mailOptions.to}`);
    console.log(`Asunto: ${mailOptions.subject}`);
    console.log('Intentando enviar correo...');

    // Enviar el correo
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado correctamente');
    console.log('ID del mensaje:', info.messageId);
    console.log('Respuesta del servidor:', info.response);

    res.status(200).json({ 
      success: true, 
      message: 'Formulario enviado correctamente' 
    });
  } catch (error) {
    console.error('❌ Error al enviar el formulario:');
    console.error(`Tipo de error: ${error.name}`);
    console.error(`Mensaje: ${error.message}`);
    
    if (error.code) {
      console.error(`Código: ${error.code}`);
    }
    
    if (error.response) {
      console.error(`Respuesta del servidor: ${error.response}`);
    }
    
    if (error.stack) {
      console.error('Stack de error:');
      console.error(error.stack);
    }

    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar el formulario',
      error: error.message
    });
  }
});

// Ruta para obtener los registros de la tabla
app.get('/api/formularios', async (req, res) => {
  console.log('📥 Recibida petición GET a /api/formularios');
  
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .query('SELECT * FROM [dbo].[Formularios] ORDER BY [FechaRegistro] DESC');
    
    console.log(`✅ Recuperados ${result.recordset.length} registros de la base de datos`);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('❌ Error al obtener registros de la base de datos:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener los registros',
      error: error.message
    });
  }
});

// Ruta para la página de registros
app.get('/registros', (req, res) => {
  res.sendFile(__dirname + '/registros.html');
});

// Ruta para comprobar que el servidor está funcionando
app.get('/', (req, res) => {
  console.log('📥 Recibida petición GET a /');
  
  // Obtener la IP del cliente
  const clientIP = req.headers['x-forwarded-for'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress;
  
  // Crear un objeto con información de diagnóstico
  const diagnosticInfo = {
    message: 'API para formulario de contacto funcionando correctamente',
    timestamp: new Date().toISOString(),
    clientIP: clientIP,
    headers: req.headers,
    nodeVersion: process.version,
    envVars: {
      PORT: PORT,
      NODE_ENV: process.env.NODE_ENV || 'not set'
    }
  };
  
  // Mostrar información en los logs del servidor
  console.log('Información de diagnóstico:');
  console.log(JSON.stringify(diagnosticInfo, null, 2));
  
  // Enviar respuesta con la información de diagnóstico
  res.json(diagnosticInfo);
});

// Iniciar el servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err.message);
});

// Exportar la app para Vercel
module.exports = app; 