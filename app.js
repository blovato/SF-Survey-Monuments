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

var currentURL = 'http://dev-gis:6080/arcgis/rest/services/SurveyMonuments/FeatureServer/0';
// add our feature layer to the map
var monumentsCurrent = L.esri.featureLayer({
  url: 'http://dev-gis:6080/arcgis/rest/services/SurveyMonuments/FeatureServer/0',
  pointToLayer: function(geojson, latLng) {
    return L.marker(latLng, {icon: L.divIcon({className: 'div-icon'}) })
  },
  where: "log_id in (select MAX(log_id) from [sde].[dbo].[SURVEYMONUMENTS] group by name)",
  simplifyFactor: 1000,
  precision: 10
}).addTo(map);

var getLatestLogID = function(_callback){
  monumentsCurrent.query().where("log_id = (select MAX(log_id) from [sde].[dbo].[SURVEYMONUMENTS])").run(function(error, results) {
    if(error) console.log(error);
    _callback(results.features[0].properties.log_id+1);
  });
}
var getLatestMonName = function(_callback){
  monumentsCurrent.query().where("name = (select MAX(name) from [sde].[dbo].[SURVEYMONUMENTS])").run(function(error, results) {
    if(error) console.log(error);
    _callback(results.features[0].properties.name+1);
  });
}

// function to create marker upon request
var temporaryMarker = function(lat, lng) {
  loc = L.latLng(lat, lng);
  tempMarker = L.marker(loc).addTo(map);
}
temporaryMarker(1000,1000);
map.removeLayer(tempMarker);

// navbar search functionality
$(document).ready(function() {
  //disable form submit default
  var navbarForm = $('#navbarForm');
  navbarForm.on('submit', function(event) {
    event.preventDefault();
  });

  var navCancelSearch = $('#cancelSearch');
  navCancelSearch.on('click', function() {
    $('#searchResults').remove();
    $('#navbarSearch').val("");
  });

  // when values entered create result collection
  // div and query api
  var navbarInput = $('#navbarSearch');
  navbarInput.on('keyup', function() {

    var inputVal = navbarInput.val();
    var inputLen = navbarInput.val().length;

    if (inputLen > 0) {
      if ($('#searchResults').length) {} else {
        var col = $('<ul id="searchResults" class="collection"></ul>');
        $('nav').append(col);
      }
    } else {
      var searchResults = $('#searchResults');
      if (searchResults.length) {
        searchResults.remove();
      }
    }
    navbarQuery(inputVal);
  });

  var navbarQuery = function(val) {
    monumentsCurrent.query().where("log_id in (select MAX(log_id) from [sde].[dbo].[SURVEYMONUMENTS] group by name) AND name like '" + val + "%'").run(function(error, results) {

      $('a.collection-item').remove();

      if (results.features.length > 0 && results.features.length < 10) {
        for (var i = 0; i < results.features.length; i++) {
          var li = '<a href="#" value="' + results.features[i].properties.OBJECTID + '" class="collection-item">' +
            results.features[i].properties.name + '</a>';
          $('#searchResults').prepend(li);
        }
      } else if (results.features.length >= 10) {
        for (var i = 0; i < 10; i++) {
          var li = '<a href="#" value="' + results.features[i].properties.OBJECTID + '" class="collection-item">' +
            results.features[i].properties.name + '</a>';
          $('#searchResults').prepend(li);
        }
      }

      $('a.collection-item').on('click', function() {
        // hide search drop down
        $('#searchResults').remove();
        // set search input to value clicked
        $('#navbarSearch').val($(this).text());
        // remove previous search result marker
        map.removeLayer(tempMarker);

        // query monuments for the clicked value and then zoom to selection
        var oID = $(this).attr('value');
        monumentsCurrent.query().where("OBJECTID = '" + oID + "'").run(function(error, results) {
          var lat = results.features[0]['geometry']['coordinates'][1];
          var lng = results.features[0]['geometry']['coordinates'][0];

          temporaryMarker(lat, lng);
          map.setView([lat - .00027, lng], 20);

          clickedFeature = results.features[0];
          startEditing(clickedFeature);
          if (!currentlyDeleting) {
            showAttributes();
          }
        });
      });

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

// if feature has image set the value in the info window
function checkImage(value) {
  if (value == "None" || value == null) {
    document.getElementById("mon_image").src = "";
    document.getElementById("mon_image").style.display = "none";
  } else {
    document.getElementById("mon_image").src = value;
    document.getElementById("mon_image").style.display = "block";
  }
}

var nullStringify = function(str){
  if(str == null){
    return "";
  }
}
// start editing a given layer, enters data in info table
var startEditing = function(feature) {
  document.getElementById("log_id").value = feature.properties["log_id"];
  document.getElementById("name").value = feature.properties["name"];
  document.getElementById("mon_type").value = nullStringify(feature.properties["type"]);
  document.getElementById("mon_status").value = nullStringify(feature.properties["status"]);
  document.getElementById("comments").value = nullStringify(feature.properties["comments"]);
  var image_url = feature.properties["image_url"]
  checkImage(image_url);

  if (!disableEditing) {
    //feature.editing.enable();
    currentlyEditing = feature;
  }
}

// stop editing a given layer
function stopEditing() {
  // if a layer is being edited, finish up and disable editing on it afterward.
  if (currentlyEditing) {
    // convert the layer to GeoJSON and build a new updated GeoJSON object for that feature
    currentlyEditing.properties["log_id"] = document.getElementById("log_id").value;
    monumentsCurrent.updateFeature({
      type: 'Feature',
      id: currentlyEditing.id,
      geometry: currentlyEditing.geometry,
      properties: currentlyEditing.properties
    }, function(error, response) {
      console.log(error);
      console.log(response);
    });
    //currentlyEditing.editing.disable();
  }
  currentlyEditing = undefined;
}

function showAttributes() {
  document.getElementById("info-pane").style.display = 'block';
}

function hideAttributes() {
  document.getElementById("info-pane").style.display = 'none';
}


// when a pedestrian district is clicked, stop editing the current feature and edit the clicked feature
monumentsCurrent.on('click', function(e) {
  //stopEditing();
  startEditing(e.layer.feature);
  //if(!disableEditing){
    map.removeLayer(tempMarker);
    temporaryMarker(e.layer.feature.geometry.coordinates[1], e.layer.feature.geometry.coordinates[0]);
    currentlyEditing = e.layer.feature;

  //}

  if (!currentlyDeleting) {
    showAttributes();
  }
});

// when pedestrian districts start loading (because of pan/zoom) stop editing
monumentsCurrent.on('loading', function() {
  //stopEditing();
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

// when the map is clicked, stop editing
map.on('click', function(e) {
  //stopEditing();
  hideAttributes();

  map.removeLayer(tempMarker);
  // hide search results if map clicked
  var searchResults = $('#searchResults');
  if (searchResults.length) {
    searchResults.remove();
  }
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
  currentlyDeleting = false;
});

// when we start using deletion tools, hide attributes and disable custom editing
map.on('draw:deletestart', function() {
  disableEditing = true;
  currentlyDeleting = true;
});

// listen to the draw created event
map.on('draw:created', function(e) {
  // add the feature as GeoJSON (feature will be converted to ArcGIS JSON internally)
  stopEditing();
  if (!currentlyDeleting) {
    showAttributes();
  }

  getLatestLogID(function(resLog){
    getLatestMonName(function(resName){
      var feature = e.layer.toGeoJSON();
      feature.properties["log_id"] = resLog;
      feature.properties["name"] = resName;

      monumentsCurrent.addFeature(feature, function(err, res) {
        if (err) console.log(err);
        Materialize.toast('Monument Created', 4000);
      });
    });
  });

  disableEditing = false;
});

map.on('draw:edited', function(e) {
  Materialize.toast('Monument Edited', 4000);

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
    console.log(error, response);
    if(response.length == 1){
      Materialize.toast('1 Monument Deleted', 4000);
    }else if(response.length > 1){
      Materialize.toast(response.length+' Monuments Deleted', 4000);
    } else {
      Materialize.toast(error.message, 4000);
    }
  });
  disableEditing = false;
  currentlyDeleting = false;
});
