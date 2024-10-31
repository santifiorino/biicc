# Control Inmersivo

## Instalación

### Instalación

1. Clonar el repositorio:
``` shell
git clone https://github.com/santifiorino/biicc.git
cd biicc
```
2. En los archivos `public/controller/controller.js` y `public/snn/sketch.js`, reemplazar `<IP_ADDR>` con la dirección IP del servidor.
3. Instalar dependencias:
``` shell
npm install
```
4. Levantar el servidor:
``` shell
npm start
```

## Componentes

Para utilizarlo, se debe tener abierta en un navegador una instancia de la simulación y (al menos) una instancia de un controlador. En la esquina superior derecha de la simulación aparecerá un ID de 6 caracteres alfanuméricos. Ese ID debe ingresarse en la caja de texto del controlador, para que el servidor sepa qué simulación se desea controlar, ya que podría haber múltiples simulaciones ejecutándose simultáneamente. Una vez conectado, ya está todo listo para usar. A continuación, se describe cada componente en detalle:

#### Simulación

<img src="https://i.imgur.com/J2Zid1V.png" width="1000px" />

La simulación consiste en un modelo de Spiking Neural Networks (SNN). En esta simulación, a cada neurona se le puede asignar un sonido que se reproducirá cuando la neurona se active. Las neuronas interactúan entre sí en base a diferentes parámetros que se pueden controlar desde la ruta del controlador. También es posible controlar individualmente cada neurona para que emita un pulso con cierta frecuencia. Con los parámetros de la red y los de las neuronas, es posible crear una gran variedad de combinaciones que generan patrones diversos.

En la parte derecha de la simulación se visualizan distintas métricas calculadas a partir de los eventos generados (activaciones de las neuronas). Actualmente se puede ver la cantidad de eventos en los últimos 10 segundos, la media del tiempo entre cada evento y su desviación estándar. En el futuro, planeamos agregar métricas más complejas que consideren factores como la información que proporciona cada evento (entropía). Estas métricas serán útiles para que futuros algoritmos tengan un objetivo claro (por ejemplo, llevar la métrica M a un valor X).

#### Controlador

<img src="https://i.imgur.com/p6ZFeF6.png" width="750px" />

El controlador tiene dos páginas principales: "Currents" y "Network".

En la página "Currents", se encuentran varios deslizadores con un número al costado. Estos deslizadores controlan las neuronas, y el número indica qué neurona está siendo controlada. Una red puede tener muchas neuronas, por lo que, para no sobrecargar el controlador con deslizadores, solo hay 5. Sin embargo, los botones "-" y "+" permiten seleccionar qué neurona controla cada deslizador. Además de los deslizadores, se incluye un pad 2D que permite controlar dos neuronas (seleccionadas por el usuario) simultáneamente; el eje X controla una neurona como lo haría un deslizador, y el eje Y controla otra de la misma forma pero en dirección vertical.

La página "Network" es similar, pero los deslizadores son fijos y controlan parámetros globales de la red.

Un desafío que apareció a la hora de desarrollar el controlador es el de la sincronización. Inicialmente no había ningún mecanismo implementado, entonces si había varios controladores conectados al mismo tiempo y uno cambiaba un valor, a los demás controladores les quedaba el valor previo, desactualizado. Hay varias soluciones posibles a este problema, pero optamos por implementar una en la que el controlador no sólo le envía el cambio a la simulación, sino que también se lo envía a todos los controladores que estén conectados a esa misma simulación. De esta forma se mantiene un estado global -tanto la simulación como todos los controladores conectados a ella, tendrán siempre el mismo estado-.

Otro problema era que, cuando un controlador se conectaba a una simulación, comenzaba en un estado "default", pero quizás otro controlador ya estaba controlándola, y por lo tanto ya no se encontraba en el estado "default". La solución a este problema es más sencilla, y es la implementación de un método para que la simulación pueda compartir su estado. De esta forma, cuando un controlador le dice al servidor que se quiere conectar a una simulación, el servidor le pide el estado a esa simulación y se lo envía al controlador para que comience sincronizado.

## Implementación

### Comunicación

El esquema general de comunicación es el siguiente:

<img src="https://i.imgur.com/Q2sKzOK.png" width="1000px" />

La comunicación se basa completamente en mensajes [OSC](https://es.wikipedia.org/wiki/Open_Sound_Control), los cuales son transmitidos mediante WebSockets. En un principio como controlador consideramos utilizar aplicaciones móbiles existentes, que envían mensajes OSC mediante UDP . Sin embargo, dado que la simulación se ejecuta en el navegador del cliente, lo cual queríamos mantener para asegurar la facilidad de uso, no es posible abrir un puerto UDP desde el navegador para que la simulación reciba los mensajes entrantes. Por esa razón las aplicaciones existentes no se ajustaban a nuestro caso de uso, y desarrollamos un controlador propio. Tanto el controlador como el servidor hacen uso de la biblioteca [osc.js](https://www.npmjs.com/package/osc), que permite el intercambio de mensajes OSC mediante WebSockets, tecnología que sí se puede usar en cualquier navegador donde se ejecute cada simulación.

A continuación, se describe el intercambio típico de mensajes:

<img src="https://i.imgur.com/7s22z9v.png" width="750px" />

1. Al abrir una simulación en un navegador, se genera un ID. Este ID se envía al servidor a través de la ruta `/registerSimulation`. El servidor guarda la información recibida en un diccionario `(ID_Simulacion -> WebSocket)`.
2. Al abrir un controlador en un navegador, inicialmente no ocurre nada. Una vez que se ingresa el ID de la simulación en la caja de texto, se envía el ID del controlador al servidor a través de la ruta `/registerController`, junto con el ID de la simulación que se desea controlar. El servidor guarda la información recibida en dos diccionarios, el primero `(ID_Controlador -> WebSocket)` y el segundo `(ID_Controlador -> ID_Simulacion)`, que indica qué simulación está controlando cada controlador. Al recibir el mensaje de registro, el servidor solicita el estado a la simulación mediante la ruta `/getState`. Luego la simulación le responde con su estado y finalmente, el servidor le envía el estado recibido al controlador para que empiece sincronizado.
3. De la misma forma se registra otro controlador, recibiendo el estado de la simulación que desea controlar.
4. El controlador 1 realiza un cambio. Cuando eso ocurre le envía un mensaje a la ruta `/update` con los parámetros que desea modificar. Al recibir el cambio que se desea hacer, mediante el diccionario `(ID_Controlador -> ID_Simulacion)`, el servidor determina a qué simulación se lo debe envíar. Además, mediante ese mismo diccionario puede obtener la lista de todos los controladores que están controlando esa misma simulación. El servidor entonces procede a enviarle el mismo mensaje de actualización a la simulación para que cambie su estado, pero también a todos los controladores que controlaban la misma simulación para que queden sincronizados.
5. De la misma forma el controlador 2 realiza un cambio, que se reenvía al controlador 1.

### Métricas

Para poder obtener las métricas en tiempo real, se creó una clase llamada `EventTracker`, la cual mantiene una lista de los eventos ocurridos en los últimos 10 segundos. Para esto se modificó la función de callback de los eventos de las neuronas, la cual se llama cada vez que una neurona se activa. Esta función originalmente solo reproducía el sonido asignado a la neurona, pero ahora también agrega al `EventTracker` una tupla de la forma `(ID_Neurona, milisegundo)`, que indica qué neurona se activó y cuándo. Esta información es suficiente tanto para calcular las métricas actuales como para las métricas futuras. Con los milisegundos también es posible mantener solo los eventos de los últimos N segundos, de manera que las métricas se actualicen en tiempo real.
