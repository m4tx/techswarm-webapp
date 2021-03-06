//CONFIG
var serverAddress = "http://api.techswarm.org"; // if empty current server will be used
//CONFIG

var time = 0;
var lastUpdate;
lastUpdate = {
    status: new Date(0),
    sensors: new Date(0),
    planetaryData: new Date(0),
    photos: new Date(0)
};

var systemStatus;
systemStatus = {
    connected: false,
    online: false
};
var config;

var mapHandles;
mapHandles = {
    maps: {},
    markers: {},
    lastLocations: []
};
var nextLoaction;
nextLoaction = {
    latitude: null,
    longitude: null
};
var chartsToRedraw = {};

function M4TXtimestampToDate(timestamp) {
    "use strict";
    return new Date(timestamp + 'Z');
}

function getStatus() {
    "use strict";
    $.getJSON(serverAddress + config.serverURLs.statusCurrent, function (json) {
        setServerStatus(1);
        setCansatStatus(Boolean(json.connected) ? 1 : 0);

        systemStatus.connected = true;
        systemStatus.online = Boolean(json.connected);

        updateElement('mphase', json.phase);

        var timestamp = M4TXtimestampToDate(json.timestamp);

        /*if (Boolean(json.connected)) {
            var now = new Date();
            //if (Math.abs(time - Math.floor(((now.getTime() - timestamp.getTime()) / 1000)) + json.missionTime) > 5) {
                time = Math.floor(((now.getTime() - timestamp.getTime()) / 1000)) + json.missionTime;
            //}

            //if ((json.phase === 'none' || json.phase === 'launch_preparation' || json.phase === 'mission_complete') && config.elements.mtime.event !== undefined) {
            //    clearInterval(config.elements.mtime.event);
            //    config.elements.mtime.event = undefined;
            //}

            //else if (config.elements.mtime.event === undefined) {
            //    config.elements.mtime.event = setInterval(function () {
                     updateElement('mtime', time);
            //        time += 1;
            //    }, 1000);
            //}
        } else {
            time = json.missionTime;
            updateElement('mtime', time);
        }*/

        if (json.phase === 'none' || json.phase === 'launch_preparation' || json.phase === 'mission_complete') {
            time = json.missionTime;
        } else {
            var now = new Date();
            time = Math.floor(((now.getTime() - timestamp.getTime()) / 1000)) + json.missionTime;
        }
        updateElement('mtime', time);

        lastUpdate.status = timestamp;
    })
        .fail(function () {
            setServerStatus(0);
            setCansatStatus(-1);
            updateElement('mphase', 'none');
            clearInterval(config.elements.mtime.event);
            config.elements.mtime.event = undefined;
            systemStatus.connected = false;
            systemStatus.online = false;
        });
}

function getPlanetaryData() {
    "use strict";
    $.getJSON(serverAddress + config.serverURLs.planetaryData + '?since=' + getTimeStampFromDate(lastUpdate.planetaryData), function (json) {
        if (json.length > 0) {
            lastUpdate.planetaryData = M4TXtimestampToDate(json[json.length - 1].timestamp);
            $.each(json[json.length - 1], function (key, value) {
                updateElement(key, value);
            });
        }
    });
}

function getTimeStampFromDate(date) {
    "use strict";
    date.setMilliseconds(date.getMilliseconds() + 1);
    return "" + date.toISOString().replace('Z', '');
}

function getGroundStationLocation() {
    "use strict";
    $.getJSON(serverAddress + config.serverURLs.groundStationCurrent, function (json) {
        updateElement('groundStation', new google.maps.LatLng(json.latitude, json.longitude));
    });
}

function getPhotos() {
    "use strict";
    $.getJSON(serverAddress + config.serverURLs.photos + '?since=' + getTimeStampFromDate(lastUpdate.photos), function (json) {
        $.each(json, function (key, value) {
            var timestamp = M4TXtimestampToDate(value.timestamp);
            if (timestamp.getTime() > lastUpdate.photos.getTime()) {
                lastUpdate.photos = timestamp;
            }

            if (Boolean(value.isPanorama) === true) {
                updateElement('panorama', value.url);
            } else {
                updateElement('photo', value.url);
            }
        });
    });
}

function getSensorData() {
    "use strict";
    $.getJSON(serverAddress + config.serverURLs.sensors + '?since=' + getTimeStampFromDate(lastUpdate.sensors), function (json) {
        $.each(json, function (sensorName, sensorData) {
            $.each(sensorData, function (index, table) {
                var timestamp = M4TXtimestampToDate(table.timestamp);
                if (timestamp.getTime() > lastUpdate.sensors.getTime()) {
                    lastUpdate.sensors = timestamp;
                }
                $.each(table, function (key, value) {
                    if (key === 'longitude' || key === 'latitude') {
                        setCanSatLocation(key, value);
                    }
                    updateElement(key, value, timestamp);
                });
            });
        });
        updateElement('lastUpdate', lastUpdate.sensors.getHours() + ':' + lastUpdate.sensors.getMinutes() + ':' + lastUpdate.sensors.getSeconds());
        redrawCharts();
    });
}

function setCanSatLocation(key, value) {
    "use strict";
    nextLoaction[key] = value;
    if (nextLoaction.latitude !== null && nextLoaction.longitude !== null) {
        updateElement('canSatLocation', new google.maps.LatLng(nextLoaction.latitude, nextLoaction.longitude));
        nextLoaction.latitude = null;
        nextLoaction.longitude = null;
    }
}

function redrawCharts() {
    "use strict";
    $.each(chartsToRedraw, function (key, value) {
        if (value === true) {
            $('#' + key).highcharts().redraw();
            chartsToRedraw[key] = false;
        }
    });
}

function updateElement(elementName, data, timestamp) {
    "use strict";
    try {
        if (data===null) {
            data='–';
        }
        if (config.elements[elementName].modifier !== undefined) {
            data = Math.round(parseFloat(data) * config.elements[elementName].modifier * 10000) / 10000;
        }

        $.each(config.elements[elementName].containers, function (key, container) {
            try {
                if (container.type === 'map') {
                    if (mapHandles.maps[container.id] === undefined) {
                        initialiseElement(elementName);
                    }

                    if (container.panTo === true) {
                        if (mapHandles.lastLocations[elementName + container.id + 'panTo'] !== data) {
                            mapHandles.maps[container.id].panTo(data);
                            mapHandles.maps[container.id].MapCenter = data;
                            mapHandles.maps[container.id].setZoom(10);
                            mapHandles.lastLocations[elementName + container.id + 'panTo'] = data;
                        }
                    }

                    if (container.mapObject === 'marker') {
                        if (mapHandles.markers[elementName + container.id] === undefined) {
                            mapHandles.markers[elementName + container.id] = new google.maps.Marker({
                                position: data,
                                map: mapHandles.maps[container.id],
                                icon: {
                                    url: container.markerIcon
                                }
                            });
                        } else {
                            if (data !== mapHandles.lastLocations[elementName + container.id + 'marker']) {
                                mapHandles.markers[elementName + container.id].setPosition(data);
                            }
                        }
                        mapHandles.lastLocations[elementName + container.id + 'marker'] = data;

                    } else if (container.mapObject === 'polyline') {
                        if (mapHandles.lastLocations[elementName + container.id + 'line'] !== undefined) {
                            var polyLine = new google.maps.Polyline({
                                path: [
                                    mapHandles.lastLocations[elementName + container.id + 'line'],
                                    data
                                ],
                                geodesic: true,
                                strokeColor: container.lineColor,
                                strokeOpacity: 1.0,
                                strokeWeight: 2
                            });
                            polyLine.setMap(mapHandles.maps[container.id]);
                        }
                        mapHandles.lastLocations[elementName + container.id + 'line'] = data;
                    }
                }
                else if (container.type === 'chart') {
                    var chart = $('#' + container.id);
                    if (chart.highcharts() === undefined) {
                        initialiseElement(elementName);
                    }
                    if (container.series === undefined) {
                        chart.highcharts().addSeries({
                            name: container.seriesName,
                            type: container.chartType,
                            data: []
                        }, true, false);
                        container.series = chart.highcharts().series.length - 1;
                    }
                    chart.highcharts().series[container.series].addPoint([timestamp.getTime(), data], false, false);
                    chartsToRedraw[container.id] = true;
                }

                else if (container.type === 'value') {
                    var text = ' – ';
                    if (data !== undefined) {
                        text = data.toString().replace('_', ' ');
                        if (config.elements[elementName].valueSuffix !== undefined) {
                            text += config.elements[elementName].valueSuffix;
                        }
                    }
                    $('#' + container.id).html('<div class="centered"><div class="ui small statistic"><div class="label">' + config.elements[elementName].title + '</div><div class="value">' + text + '</div></div>');
                }

                else if (container.type === 'image') {
                    var htmlstring;
                    if (container.isPanorama === 'true') {
                        htmlstring = '<div class="panorama"><img src="' + serverAddress + data + '"></div>';
                    } else {
                        htmlstring = '<img class="shadow-img" src="' + serverAddress + data + '">';
                    }

                    if (container.mode === 'append') {
                        $('#' + container.id).append(htmlstring);
                    } else {
                        $('#' + container.id).html(htmlstring);
                    }
                }

                else if (container.type === 'phase_steps') {
                    var phaseNumber = 0;
                    if (data === 'launch_preparation') {
                        phaseNumber = 1;
                    } else if (data === 'launch' || data === 'countdown') {
                        phaseNumber = 2;
                    } else if (data === 'descend') {
                        phaseNumber = 3;
                    } else if (data === 'ground_operations') {
                        phaseNumber = 4;
                    } else if (data === 'mission_complete') {
                        phaseNumber = 5;
                    }

                    var i = 1;
                    $('#mission-phase').find('> div').each(function () {
                        if (i < phaseNumber) {
                            $(this).removeClass("disabled active");
                        }
                        else if (i === phaseNumber) {
                            $(this).addClass("active").removeClass("disabled");
                        }
                        else {
                            $(this).removeClass("active").addClass("disabled");
                        }
                        i++;
                    });
                }
            } catch (exception) {
                console.log(elementName);
                console.log(exception);
            }
        });
    } catch (exception) {
    }
}

function initialiseElement(elementName) {
    "use strict";
    $.each(config.elements[elementName].containers, function (key, container) {
        if (container.type === 'map') {
            $('#' + container.id).height('400px');
            mapHandles.maps[container.id] = new google.maps.Map(document.getElementById(container.id), {
                zoom: 1,
                center: new google.maps.LatLng(50.062203, 19.928722),
                disableDefaultUI: true
            });
            container.map = mapHandles.maps.length - 1;
        } else if (container.type === 'chart') {
            $('#' + container.id).highcharts({
                chart: {
                    type: container.chartType,
                    zoomType: 'x'
                },
                title: {
                    text: container.chartName
                },
                credits: {
                    enabled: false
                },
                legend: {
                    enabled: container.legend
                },
                yAxis: {
                    title: {
                        text: null
                    },
                    labels: {
                        format: '{value}' + config.elements[elementName].valueSuffix
                    }
                },
                xAxis: {
                    type: 'datetime'
                },
                tooltip: {
                    valueSuffix: config.elements[elementName].valueSuffix
                },
                series: []
            });
        }
    });
}


function setServerStatus(status) { // status: -1 - Connecting, 0 - Connection failed, 1 - Connected
    "use strict";
    if (status === -1) {
        $('#status-server').html("Connecting").css("color", "black").parent().next().find('.loader').addClass("active");
        setCansatStatus(-1);
    } else if (status === 1) {
        $('#status-server').html("Connected").css("color", "green").parent().next().find('.loader').removeClass("active");
    } else if (status === 0) {
        $('#status-server').html("Connection failed!").css("color", "red").parent().next().find('.loader').removeClass("active");
        setCansatStatus(-1);
    }
}

function setCansatStatus(status) { // status: -1 - Unknown , 0 - Offline, 1 - Online
    "use strict";
    if (status == -1) {
        $('#status-cansat').html(" – ").css("color", "black");
    } else if (status === 1) {
        $('#status-cansat').html("Online").css("color", "green");
    } else if (status === 0) {
        $('#status-cansat').html("Offline").css("color", "black");
    }
}

function loadStaticData() {
    "use strict";
    $.each(config.staticData, function (key, value) {
        updateElement(key, value);
    });
}

function gridPrinter(x, y, container) {
    "use strict";
    var grid = "";
    for (var i = 1; i <= y; i++) {
        grid += '<div class="row">';
        for (var j = 1; j <= x; j++) {
            grid += '<div class="column" id="' + container + '-' + i + '-' + j + '"></div>';
        }
        grid += '</div>';
    }
    $('#' + container).append(grid);
}

function initialiseApp() {
    "use strict";
    if(config.adminTab === 'true') {
        initialiseAdmin();
    }

    loadStaticData();
    getStatus();

    setTimeout(function () {
        if (systemStatus.connected) {
            getPlanetaryData();
            getGroundStationLocation();
            getSensorData();
            getPhotos();

            $('.sidebar.menu .item').tab('change tab', config.startTab);
        }
        setInterval(function () {
            getStatus();
            if (systemStatus.connected) {
                getPlanetaryData();
                getGroundStationLocation();
                getSensorData();
                getPhotos();
            }
        }, 2500);
    }, 1000);
}

function getConfig() {
    "use strict";
    $.getJSON(serverAddress + '/config/webapp.config.json', function (json) {
        config = json;

        initialiseApp();

    }).fail(function () {
        setServerStatus(0);
        setCansatStatus(-1);
        updateElement('mphase', 'none');
        systemStatus.connected = false;
        systemStatus.online = false;
    });
}

function initialisePage() {
    "use strict";
    $('#sidebar').sidebar({
        transition: 'overlay',
        mobileTransition: 'overlay',
        dimPage: false
    })
        .sidebar('attach events', '.view-sidebar', 'toggle');

    $('.sidebar.menu .item').tab({
        onTabLoad: function () {
            $('#sidebar').sidebar('hide');
            $(window).trigger('resize');
            $.each(mapHandles.maps, function (key, value) {
                google.maps.event.trigger(value, 'resize');
                value.panTo(value.MapCenter);
            });
        }
    });

    if (serverAddress === "") {
        serverAddress = window.location.host;
    }

    gridPrinter(3, 9, 'dashboard');
    gridPrinter(3, 4, 'pdata');
    gridPrinter(1, 8, 'telemetry');
    gridPrinter(1, 2, 'photos');

    getConfig();
}


$(document).ready(function () {
    "use strict";
    initialisePage();
});