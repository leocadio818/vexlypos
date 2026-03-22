# VexlyPOS — Manual de Instalación del Agente de Impresión
## Guía Paso a Paso para Nuevos Clientes

---

## QUE ES EL AGENTE DE IMPRESION?

El agente es un programa pequeño que corre en UNA computadora del restaurante.
Su trabajo es recibir los trabajos de impresión del sistema web (pre-cuentas, facturas, comandas de cocina/bar) y enviarlos a las impresoras correctas por la red local.

---

## REQUISITOS

- Una PC con Windows (puede ser la de caja)
- Python instalado (descargar gratis de https://www.python.org/downloads/)
  - IMPORTANTE: Al instalar Python, marcar la casilla "Add Python to PATH"
- Impresoras térmicas conectadas a la red local con IP fija
- Conexión a internet (para comunicarse con el servidor)

---

## ARCHIVOS NECESARIOS

Descargar estos 4 archivos de GitHub (github.com/leocadio818/vexlypos):

| Archivo | Para qué sirve |
|---------|---------------|
| Instalar_VexlyPOS_PrintAgent.bat | Instalador (se ejecuta 1 sola vez) |
| VexlyPOS_PrintAgent.py | El agente de impresión |
| config.txt | Configuración de impresoras |
| RunAgent.vbs | Ejecuta el agente sin ventana visible |

---

## PASO 1: CREAR LA CARPETA

1. Abre el explorador de archivos
2. Ve a C:\
3. Crea una carpeta llamada: VexlyPOS
4. Copia los 4 archivos dentro de C:\VexlyPOS\

---

## PASO 2: CONFIGURAR LAS IMPRESORAS

1. Abre el archivo C:\VexlyPOS\config.txt con el Bloc de Notas
2. Edita las siguientes líneas:

```
# URL del servidor del cliente (cambiar por su dominio)
SERVER_URL=https://NOMBRE-DEL-CLIENTE.vexlyapp.com

# Intervalo de polling en segundos (no cambiar)
POLL_INTERVAL=3

# Puerto de red para impresoras (no cambiar)
NETWORK_PORT=9100

# IMPRESORAS — Agregar una línea por cada impresora
# El nombre después de PRINTER_ debe coincidir con el CODIGO
# del canal de impresión configurado en el sistema web
# (Config > Impresión > Canales > Código)

PRINTER_RECEIPT=192.168.1.114
PRINTER_KITCHEN=192.168.1.117
PRINTER_BAR=192.168.1.116
PRINTER_CAJA2=192.168.1.115
```

3. Cambia SERVER_URL por el dominio real del cliente
4. Cambia las IPs por las IPs reales de las impresoras del cliente
5. Si el cliente tiene más o menos impresoras, agrega o quita líneas
6. Guarda el archivo

### COMO SABER LA IP DE UNA IMPRESORA?

- Busca en la configuración de red de la impresora
- O imprime una página de configuración desde la impresora (generalmente manteniendo un botón)
- La IP debe ser FIJA (estática), no DHCP

### COMO SABER EL CODIGO DEL CANAL?

1. Entra al sistema web del cliente
2. Ve a Config > Impresión > Canales
3. El código aparece al lado del nombre de cada canal
4. Ejemplo: si el canal se llama "Cocina" y tiene código "kitchen", la línea es:
   PRINTER_KITCHEN=IP_DE_LA_IMPRESORA

---

## PASO 3: EJECUTAR EL INSTALADOR

1. Haz clic derecho en Instalar_VexlyPOS_PrintAgent.bat
2. Selecciona "Ejecutar como administrador"
3. Espera a que termine — debe decir "INSTALACION COMPLETADA EXITOSAMENTE"
4. Presiona cualquier tecla para cerrar

### QUE HACE EL INSTALADOR?

- Instala las dependencias de Python necesarias
- Crea una tarea programada para que el agente se inicie automáticamente con Windows
- Arranca el agente por primera vez

---

## PASO 4: VERIFICAR QUE FUNCIONA

1. Entra al sistema web del cliente
2. Ve a Config > Impresión > Canales
3. Haz clic en el icono de impresora (test) de cualquier canal
4. Debe salir un papelito en la impresora correspondiente que dice "TEST [NOMBRE DEL CANAL]"
5. Si sale el papelito, TODO ESTA FUNCIONANDO

---

## LISTO — NO HAY QUE HACER NADA MAS

- El agente corre en segundo plano (no se ve ninguna ventana)
- Se inicia automáticamente cuando se enciende la PC
- No requiere mantenimiento

---

## SOLUCIÓN DE PROBLEMAS

### "El test no imprime"

1. Verifica que la impresora esté encendida y conectada a la red
2. Verifica que la IP en config.txt sea correcta
3. Abre CMD y ejecuta: ping IP_DE_LA_IMPRESORA
   - Si dice "Reply" = la impresora está en red
   - Si dice "Request timed out" = la impresora no está accesible
4. Verifica que el agente esté corriendo:
   - Abre CMD y ejecuta: python C:\VexlyPOS\VexlyPOS_PrintAgent.py
   - Si dice "VexlyPOS Print Agent — Multi-Impresora" = está funcionando
   - Si hay errores, anota el mensaje

### "Imprime en la impresora equivocada"

1. Verifica en config.txt que las IPs estén correctas
2. Verifica en Config > Impresión > Canales que los códigos coincidan
3. Ejemplo: si config.txt dice PRINTER_BAR=192.168.1.116
   entonces el canal BAR en el sistema debe tener código "bar" (minúscula)

### "Imprime doble"

1. Verifica que solo haya UN agente corriendo
2. Abre CMD y ejecuta: taskkill /f /im pythonw.exe
3. Luego: wscript C:\VexlyPOS\RunAgent.vbs
4. Si el problema persiste, busca en el Task Scheduler de Windows
   si hay una tarea "MesaPOS_PrintAgent" vieja y elimínala

### "El agente no arranca al reiniciar la PC"

1. Ejecuta el instalador de nuevo (Instalar_VexlyPOS_PrintAgent.bat como administrador)
2. Eso recrea la tarea programada

### "Sale un papel en blanco"

1. Puede ser un trabajo viejo en la cola
2. Ve al sistema web: Config > Impresión > y limpia la cola de impresión
3. Reinicia el agente

---

## COMO ACTUALIZAR EL AGENTE

Si hay una versión nueva del agente:

1. Descarga el nuevo VexlyPOS_PrintAgent.py de GitHub
2. En CMD ejecuta: taskkill /f /im pythonw.exe
3. Copia el archivo nuevo a C:\VexlyPOS\ reemplazando el anterior
4. Doble clic en RunAgent.vbs para arrancarlo de nuevo
5. NO necesitas modificar config.txt (la configuración se mantiene)

---

## COMO CAMBIAR DE SERVIDOR (NUEVO DOMINIO)

1. Abre C:\VexlyPOS\config.txt
2. Cambia la línea SERVER_URL=https://VIEJO.vexlyapp.com por SERVER_URL=https://NUEVO.vexlyapp.com
3. Reinicia el agente:
   - CMD: taskkill /f /im pythonw.exe
   - Doble clic en RunAgent.vbs

---

## COMO AGREGAR O QUITAR IMPRESORAS

1. Abre C:\VexlyPOS\config.txt
2. Agrega una nueva línea: PRINTER_NOMBRE=IP
3. O elimina la línea de la impresora que ya no existe
4. Reinicia el agente

---

## RESUMEN RÁPIDO

| Acción | Comando |
|--------|---------|
| Instalar por primera vez | Ejecutar .bat como administrador |
| Arrancar manualmente | Doble clic en RunAgent.vbs |
| Detener el agente | CMD: taskkill /f /im pythonw.exe |
| Ver logs (errores) | CMD: type C:\VexlyPOS\VexlyPOS_PrintAgent.log |
| Verificar que funciona | Config > Impresión > Botón test de cualquier canal |

---

Documento creado: Marzo 2026
Versión: 1.0
