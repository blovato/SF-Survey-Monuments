$(document).ready(function() {
  //set map height in window
  $(window).resize(function() {
    var navHeight = $('nav').height();
    var h = window.innerHeight;
    $('#map').css('height', h - navHeight);
  });
  $(window).resize();
});


// create the map
var map = L.map('map').setView([37.825293, -122.370689], 16);
var OpenStreetMap_Mapnik = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

var currentURL = 'http://dev-gis:6080/arcgis/rest/services/Monumental/FeatureServer/0';
// add our feature layer to the map
var monumentsCurrent = L.esri.featureLayer({
  url: currentURL,
  pointToLayer: function(geojson, latLng){
    return L.marker(latLng, {
      icon: L.divIcon({className: 'div-icon'})
    })
  }
}).addTo(map);

/* geocoding control
var sfBounds = L.latLngBounds([L.latLng(37.894904889, -122.34443664),
  L.latLng(37.64658749, -122.8553009)
]);

var arcgisOnline = L.esri.Geocoding.arcgisOnlineProvider();
var searchControl = L.esri.Geocoding.geosearch({
  providers: [
    new L.esri.Geocoding.FeatureLayerProvider({
      label: 'Monument Name',
      url: currentURL,
      searchFields: ['name']
    }),
    arcgisOnline
  ],
  useMapBounds: false,
  searchBounds: sfBounds
}).addTo(map);
*/

// navbar search functionality
$(document).ready(function() {

  //disable form submit default
  var navbarForm = $('#navbarForm');
  navbarForm.on('submit', function(event){
    event.preventDefault();
  });

  // when values entered create result collection
  // div and query api
  var navbarInput = $('#navbarSearch');
  navbarInput.on('keyup', function(){

    var inputVal = navbarInput.val();
    var inputLen = navbarInput.val().length;

    if(inputLen > 0 ){
      if($('#searchResults').length){
      }else {
        var col = $('<ul id="searchResults" class="collection"></ul>');
        $('nav').append(col);
      }
    } else {
      var searchResults = $('#searchResults');
      if(searchResults.length){
        searchResults.remove();
      }
    }
    navbarQuery(inputVal);
  });

  var navbarQuery = function(val){
    L.esri.query({
      url: currentURL
    }).where("name="+val+"").run(function(error, results){
      $('a.collection-item').remove();
      if(results.features.length > 0){
        for(var i = 0; i < results.features.length; i++){
          var li = '<a href="#" class="collection-item">'+
                    results.features[i].properties.name+'</a>';
          $('#searchResults').prepend(li);
          console.log(results.features[i].properties.name);
        }
      }
      else {

      }
      // draw neighborhood on the map
      //var point = L.geoJson(result);
      // fit map to boundry
      //map.fitBounds(point.getBounds().pad(0.5));
    });
  }
});




// variable to track the layer being edited
var currentlyEditing;
var currentlyDeleting = false;

// create a feature group for Leaflet Draw to hook into for delete functionality
var drawnItems = L.featureGroup();
map.addLayer(drawnItems);

// track if we should disable custom editing as a result of other actions (create/delete)
var disableEditing = false;

function checkImage(value) {
  if (value == "None" || value == null) {
    document.getElementById("mon_image").src = "";
    document.getElementById("mon_image").style.display = "none";
  } else {
    document.getElementById("mon_image").src = value;
    document.getElementById("mon_image").style.display = "block";
  }
}

// start editing a given layer
function startEditing(layer) {
  document.getElementById("log_id").value = layer.feature.properties["log_id"];
  document.getElementById("name").value = layer.feature.properties["name"];
  document.getElementById("mon_type").value = layer.feature.properties["type"];
  var image_url = layer.feature.properties["image_url"]
  checkImage(image_url);

  if (!disableEditing) {
    layer.editing.enable();
    currentlyEditing = layer;
  }
}

// stop editing a given layer
function stopEditing() {
  // if a layer is being edited, finish up and disable editing on it afterward.
  if (currentlyEditing) {
    handleEdit(currentlyEditing);
    currentlyEditing.editing.disable();
  }
  currentlyEditing = undefined;
}

function handleEdit(layer) {
  // convert the layer to GeoJSON and build a new updated GeoJSON object for that feature
  layer.feature.properties["log_id"] = document.getElementById("log_id").value;
  monumentsCurrent.updateFeature({
    type: 'Feature',
    id: layer.feature.id,
    geometry: layer.toGeoJSON().geometry,
    properties: layer.feature.properties
  }, function(error, response) {

  });
}

function showAttributes() {
  document.getElementById("info-pane").style.display = 'block';
}

function hideAttributes() {
  document.getElementById("info-pane").style.display = 'none';
}

// when the map is clicked, stop editing
map.on('click drag', function(e) {
  stopEditing();
  hideAttributes();

  // hide search results if map clicked
  var searchResults = $('#searchResults');
  if(searchResults.length){
    searchResults.remove();
  }
});

// when a pedestrian district is clicked, stop editing the current feature and edit the clicked feature
monumentsCurrent.on('click', function(e) {
  stopEditing();
  startEditing(e.layer);
  if (!currentlyDeleting) {
    showAttributes();
  }
});

// when pedestrian districts start loading (because of pan/zoom) stop editing
monumentsCurrent.on('loading', function() {
  stopEditing();
});

// when new features are loaded clear our current guides and feature groups
// then load the current features into the guides and feature group
monumentsCurrent.on('load', function() {
  // wipe the current layers available for deltion and clear the current guide layers.
  drawnItems.clearLayers();

  // for each feature push the layer representing that feature into the guides and deletion group
  monumentsCurrent.eachFeature(function(layer) {
    drawnItems.addLayer(layer);
  });
});

// create a new Leaflet Draw control
var drawControl = new L.Control.Draw({
  edit: {
    featureGroup: drawnItems, // allow editing/deleting of features in this group
    edit: true // disable the edit tool (since we are doing editing ourselves)
  },
  draw: {
    rectangle: false,
    circle: false,
    marker: true,
    polyline: false,
    polygon: false
  }
});

// add our drawing controls to the map
map.addControl(drawControl);

// when we start using creation tools disable our custom editing
map.on('draw:createstart', function() {
  disableEditing = true;
});

// when we start using deletion tools, hide attributes and disable custom editing
map.on('draw:deletestart', function() {
  disableEditing = true;
  currentlyDeleting = true;
});

// listen to the draw created event
map.on('draw:created', function(e) {
  // add the feature as GeoJSON (feature will be converted to ArcGIS JSON internally)
  console.log(e.layer);

  feature = {
    log_id: 9999,
    name: 9999999
  };

  monumentsCurrent.addFeature(feature, function(err, res) {
    if (err) console.log(err);
    else console.log(res);
  });

  disableEditing = false;
});

map.on('draw:edited', function(e) {
  var layers = e.layers;
  layers.eachLayer(function(layer) {
    //do whatever you want, most likely save back to db
  });
});

// listen to the draw deleted event
map.on('draw:deleted', function(e) {
  var delArray = [];
  e.layers.eachLayer(function(layer) {
    var id = layer.feature.id;
    delArray.push(id);
  });
  monumentsCurrent.deleteFeatures(delArray, function(error, response) {
    if (error) {
      console.log(error, response);
    }
  });
  disableEditing = false;
  currentlyDeleting = false;
});