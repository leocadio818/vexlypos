# 🖨️ Guía del Agente de Impresión USB

## Descripción
El agente de impresión es un script Python que se ejecuta en la computadora donde está conectada la impresora USB. Se comunica con el servidor POS y envía los trabajos de impresión a la impresora.

## Requisitos

1. **Python 3.8+** instalado
2. **Impresora térmica USB** (80mm recomendado)
3. **Conexión a la red** del servidor POS

## Instalación

### 1. Instalar dependencias
```bash
pip install python-escpos requests
```

### 2. Conectar la impresora
- Conecta la impresora por USB
- Enciéndela y espera a que esté lista

### 3. Probar la conexión
```bash
python print_agent.py --test
```

Si la impresora está bien conectada, se imprimirá un ticket de prueba.

## Uso

### Modo Normal (Polling)
```bash
python print_agent.py --server http://[IP-DEL-SERVIDOR]:8001
```

Reemplaza `[IP-DEL-SERVIDOR]` con la IP de la computadora donde corre el POS.

Ejemplo:
```bash
python print_agent.py --server http://192.168.1.100:8001
```

### Opciones Adicionales

| Opción | Descripción | Default |
|--------|-------------|---------|
| `--server` | URL del servidor POS | http://localhost:8001 |
| `--printer` | Tipo: USB o NETWORK | USB |
| `--ip` | IP de impresora de red | - |
| `--interval` | Segundos entre polls | 2 |
| `--test` | Imprimir ticket de prueba | - |

## Impresoras Compatibles

El agente detecta automáticamente las siguientes impresoras:

| Marca | Modelo | VID:PID |
|-------|--------|---------|
| Epson | TM-T20 | 04b8:0202 |
| Epson | TM-T88 | 04b8:0e15 |
| Star | TSP100 | 0519:0003 |
| XPrinter | - | 0483:5743 |
| Generic | 80mm | 0416:5011 |

### Agregar impresora no listada

1. Conecta la impresora
2. En Linux, ejecuta: `lsusb`
3. En Windows, revisa el Administrador de dispositivos
4. Edita `print_agent.py` y agrega tu impresora a `KNOWN_PRINTERS`

## Ejecución Automática

### Linux (systemd)

1. Crea el servicio:
```bash
sudo nano /etc/systemd/system/pos-printer.service
```

2. Contenido:
```ini
[Unit]
Description=Mesa POS Printer Agent
After=network.target

[Service]
ExecStart=/usr/bin/python3 /ruta/a/print_agent.py --server http://192.168.1.100:8001
Restart=always
User=tu-usuario

[Install]
WantedBy=multi-user.target
```

3. Activa el servicio:
```bash
sudo systemctl enable pos-printer
sudo systemctl start pos-printer
```

### Windows

1. Crea un archivo `iniciar_impresora.bat`:
```batch
@echo off
python C:\ruta\a\print_agent.py --server http://192.168.1.100:8001
pause
```

2. Copia el archivo a la carpeta de Inicio:
   - Presiona `Win + R`
   - Escribe `shell:startup`
   - Pega el archivo `.bat`

## Solución de Problemas

### "No se encontró impresora USB compatible"
- Verifica que la impresora esté encendida
- Desconecta y reconecta el cable USB
- Ejecuta con permisos de administrador
- En Linux: `sudo python print_agent.py --test`

### "python-escpos no instalado"
```bash
pip install python-escpos
```

### Error de permisos en Linux
```bash
# Agrega tu usuario al grupo lp
sudo usermod -a -G lp $USER
# Cierra sesión y vuelve a entrar
```

### La impresora no imprime
1. Verifica que el agente esté corriendo
2. Verifica que el servidor POS esté activo
3. Revisa la cola de impresión en el POS (Configuración > Impresión)

## Flujo de Impresión

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   POS App   │ ───► │  Servidor    │ ───► │   Agente    │
│  (Tablet)   │      │  (Backend)   │      │   USB       │
└─────────────┘      └──────────────┘      └─────────────┘
                            │                     │
                     Cola de impresión      Impresora USB
```

1. El usuario hace clic en "Imprimir" en el POS
2. El servidor agrega el trabajo a la cola
3. El agente revisa la cola cada 2 segundos
4. Al encontrar un trabajo, lo envía a la impresora
5. El agente marca el trabajo como completado

## Soporte

Si tienes problemas, contacta a soporte técnico.

---

**Mesa POS RD** - Sistema POS para Restaurantes
