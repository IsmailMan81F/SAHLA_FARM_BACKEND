// the goal of this file is to connect to an HA account and subscribe into any change happens
// log the changes with console.log()

const Websocket = require("ws");
const socket = new Websocket("http://localhost:8123/api/websocket");




socket.on("open", () => {
  console.log("connection is opened !");
});



socket.on("message", (msg) => {

  const data = JSON.parse(msg);
  if (data.type === "auth_required") { //this is to do the authentication when it asks
    const response = {
      type: "auth",
      access_token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxODI 4MGJlODIyYTk0MjIyOWE0OWQ1NTBmOTdhNDI2YyIsImlhdCI6MTc3NjYwMjgxOSwiZXhwIjoyMDkxOTYyODE5fQ.fFVJIJgFiKbRP5xJPlg133n-1DRm7VlyM-pljTW0GdE",
    };
    socket.send(JSON.stringify(response));
  }



  if (data.type === "auth_ok") { //this is when the authentication is confirmed (happens only one time, you can like i did subscribe)
    const request = {
      id: 1,
      type: "subscribe_events",
      event_type: "state_changed",
    };
    socket.send(JSON.stringify(request))
  }



  if (data.type === "auth_invalid") { //when the token is not valid
    console.log("Authentication is invalid !");
  }




  if (data.type === "event") { //when a event happens (the changed state is here )
    console.log(data);
  }




  if (data.type === "result") { //subscription accepted, or call service accepted, or comming data (like from the "get_states")
    console.log(data)
  }
});
