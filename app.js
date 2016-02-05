$(document).ready(function() {
  //set map height in window
  $(window).resize(function() {
    var navHeight = $('nav').height();
    var h = window.innerHeight;
    $('#map').css('height', h - navHeight);
  });
  $(window).resize();
  // init materialize selector
  $('select').material_select();
});

// create the map
var map = L.map('map', {attributionControl: false}).setView([37.825293, -122.370689], 16);
var OpenStreetMap_Mapnik = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

var currentURL = 'http://dev-gis:6080/arcgis/rest/services/SFSurveyMonuments/FeatureServer/0';
var whereQuery = 'log_id in (SELECT MAX(log_id) FROM [sde].[dbo].[SFMONUMENTS] GROUP BY name_1)';
// add our feature layer to the map
var monumentsCurrent = L.esri.featureLayer({
  url: currentURL,
  pointToLayer: function(geojson, latLng) {
    return L.marker(latLng, {icon: L.divIcon({className: 'div-icon'}) })
  },
  where: whereQuery,
  simplifyFactor: 1000,
  precision: 10
}).addTo(map);
monumentsCurrent.metadata(function(data){
  console.log(data);
});

var getLatestLogID = function(_callback){
  monumentsCurrent.query().where("log_id = (select MAX(log_id) from [sde].[dbo].[SFMONUMENTS])").run(function(error, results) {
    if(error) console.log(error);
    _callback(results.features[0].properties.log_id+1);
  });
}
var getLatestMonName = function(_callback){
  monumentsCurrent.query().where("name = (select MAX(name) from [sde].[dbo].[SFMONUMENTS])").run(function(error, results) {
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

  // function run every key up on search
  // queries layer and creates link results
  var navbarQuery = function(val) {
    monumentsCurrent.query().where("log_id in (select MAX(log_id) from [sde].[dbo].[SFMONUMENTS] group by name_1) AND name_1 like '" + val + "%'").run(function(error, results) {
      $('a.collection-item').remove();

      if (results.features.length > 0 && results.features.length < 10) {
        for (var i = 0; i < results.features.length; i++) {
          var li = '<a href="#" value="' + results.features[i].properties.OBJECTID + '" class="collection-item">' +
            results.features[i].properties.name_1 + '</a>';
          $('#searchResults').prepend(li);
        }
      } else if (results.features.length >= 10) {
        for (var i = 0; i < 10; i++) {
          var li = '<a href="#" value="' + results.features[i].properties.OBJECTID + '" class="collection-item">' +
            results.features[i].properties.name_1 + '</a>';
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

// update feature from info pane
$("#attributeSaveBtn").on("click", function(){
  // if a layer is being edited, finish up and disable editing on it afterward.
  if (currentlyEditing) {
    var feature = currentlyEditing;

    getLatestLogID(function(resLog){
      console.log(resLog);
      feature.properties["log_id"] = resLog;
      feature.properties["name_1"] = $("#name").val();
      feature.properties["mon_type"] = $("#mon_type").val();
      feature.properties["status"] = $("#mon_status").val();
      feature.properties["comments"] = $("#comments").val();
      feature.properties["image_url"] = $("#image_url").val();
      feature.properties["Measure_Date"] = String(Date.now());

      monumentsCurrent.addFeature({
        type: 'Feature',
        id: feature.id,
        geometry: feature.geometry,
        properties: feature.properties
      }, function(error, response) {
        console.log(error);
        console.log(response);
        if(response){
          Materialize.toast("Edit Successful", 4000);
        }
        else {
          Materialize.toast("Edit Failed", 4000);
        }
      });
    });
  }

  hideAttributes();
  currentlyEditing = undefined;
});

//animate rotate div function
var animateRotate = function(startAngle,endAngle, speed) {
  var elem = $("#historyBtnIcon");
  $({deg: startAngle}).animate({deg: endAngle}, {
    duration: speed,
    step: function(now) {
      elem.css({
        transform: "rotate(" + now + "deg)"
      });
    }
  });
}


$("#historyBtn").on('click', function(){
  var hist = $("#historyContainer");
  if(hist.css('display') == "none"){
    animateRotate(0,45, 100);
    showHistory();
  }else {
    animateRotate(45, 90, 100);
    hideHistory();
  }
});

var showHistory = function(){
  $("#historyContainer").show(150);
};

var hideHistory = function(){
  $("#historyContainer").hide(200);
};

function showAttributes() {
  $("#info-pane").animate({
    bottom: '-25px',
    opacity: '1'
  }, 80);
}

function hideAttributes() {
  var paneHeight = $("#info-pane").height() +50;
  $("#info-pane").animate({
    bottom: '-'+String(paneHeight)+'px',
    opacity: '0'
  }, 250);
}

// start editing a given layer, enters data in info table
var startEditing = function(feature) {

  $("#log_id").val(feature.properties["log_id"]);
  $("#name").val(feature.properties["name_1"]);

  // type selector logic
  var type = feature.properties["mon_type"];
  var idxParenthesis;
  if(type != null){
    idxParenthesis = type.indexOf(" (");
  } else { type = "null";}

  if(idxParenthesis > 2){
    type = type.slice(0, idxParenthesis);
  }
  $("#mon_type option").filter(function() {
    return this.text == type; 
  }).attr('selected', true);
  $('#mon_type').material_select();

  // status selector logic
  var status = feature.properties["status"];
  if(status == null){
    status = "null";
  }else if(status == "Left as found" || status == "Rebuilt/Rehabilitated" || status == "Reestablished"){
    status = "Found";
  }else if(status == "Searched for not found"){
    status = "Lost";
  }
  $("#mon_status option").filter(function() {
    return this.text == status; 
  }).attr('selected', true);
  $('#mon_status').material_select();

  $("#comments").val(feature.properties["comments"]);

  $("#image_url").val(feature.properties["image_url"]);


  if (!disableEditing) {
    //feature.editing.enable();
    currentlyEditing = feature;
  }
}

// when a pedestrian district is clicked, stop editing the current feature and edit the clicked feature
monumentsCurrent.on('click', function(e) {
  startEditing(e.layer.feature);
  if(!currentlyEditing || !currentlyDeleting){
    map.removeLayer(tempMarker);
    temporaryMarker(e.layer.feature.geometry.coordinates[1], e.layer.feature.geometry.coordinates[0]);
    currentlyEditing = e.layer.feature;
  }

  if (!currentlyDeleting) {
    showAttributes();
  }
});

// when pedestrian districts start loading (because of pan/zoom) stop editing
monumentsCurrent.on('loading', function() {
  currentlyEditing = undefined;
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
  currentlyEditing = undefined;
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

  getLatestLogID(function(resLog){
    getLatestMonName(function(resName){
      var feature = e.layer.toGeoJSON();
      feature.properties["log_id"] = resLog;
      feature.properties["name_1"] = resName;
      feature.properties["name"] = resName;
      feature.properties["latitude"] = feature.geometry.coordinates[1];
      feature.properties["longitude"] = feature.geometry.coordinates[0];
      feature.properties["Measure_Date"] = String(Date.now());

      monumentsCurrent.addFeature(feature, function(err, res) {
        if (err) console.log(err);
        Materialize.toast('Monument Created', 4000);
        if (!currentlyDeleting) {
          startEditing(feature);
          showAttributes();
        }
      });
    });
  });

  disableEditing = false;
});

map.on('draw:edited', function(e) {

  e.layers.eachLayer(function(layer) {
    getLatestLogID(function(resLog){
  
      var feature = layer.toGeoJSON();
      feature.properties["log_id"] = resLog;
      console.log(feature);

      monumentsCurrent.addFeature(feature, function(error, response) {
        console.log(error, response);
        if(response.length == 0){
          Materialize.toast('1 Monument Edited', 4000);
        }else if(response.length >= 1){
          Materialize.toast(response.length+' Monuments Edited', 4000);
        } else {
          Materialize.toast(error, 4000);
        }
      });
      
    });
  });
});

map.on("draw:deletestop", function(){
  currentlyDeleting = false;
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
    if(error){
      Materialize.toast(error, 4000)
    } else if(response.length == 1){
      Materialize.toast('1 Monument Deleted', 4000);
    } else if(response.length > 1){
      Materialize.toast(response.length+' Monuments Deleted', 4000);
    } else {
      Materialize.toast(error.message, 4000);
    }
  });

  disableEditing = false;
  currentlyDeleting = false;
});