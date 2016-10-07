import domready from 'domready'
import L from 'leaflet'
import $ from 'jquery';
import request from 'superagent';
import xml2jsParser from 'superagent-xml2jsparser';
import proj4 from 'proj4';
import {map, merge, isEmpty} from 'lodash';
import CodeMirror from 'codemirror/lib/codemirror'
import io from 'socket.io-client'
import NProgress from 'nprogress';

require('codemirror/mode/javascript/javascript');
require('jquery-ui');
require('jquery-ui/ui/widgets/datepicker');
require('jquery-ui/ui/widgets/tabs');
require('jquery-ui/ui/widgets/slider');
require('jquery-ui/ui/widgets/tooltip');
require('jquery-ui/ui/widgets/dialog');
require('jquery-ui-touch-punch/jquery.ui.touch-punch.min');

// production
let baseWmsUrl = "http://services.sentinel-hub.com"
let instanceID = "GET_API_KEY"
let baseIndexUrl = baseWmsUrl

let imgWmsUrl = baseWmsUrl + "/v1/wms/" + instanceID + "?SERVICE=WMS&REQUEST=GetMap";
var mapa;
require('style!css!sass!./styles/style.scss')
var config = require('./config');
import moment from 'moment'
import dragula from 'dragula'
import geocomplete from 'geocomplete'
let doRefresh = true, searchPlace = false;

var siteUrl = "";
var wmsUrlPrefix = imgWmsUrl;
var imgWidth = 640;
var imgHeight = imgWidth;
var currentCoords = [];
var bgColor = "00000000";
var hashVal = "";
var doGetImg = false, doShare = false, noHash = true;
var wmsUrl = "";
var codeeditor;
var sentL;

var minScale = 6;

domready(function () {
    var parseString = require('xml2js').parseString;
    var didLoop = false;

    request.get(baseWmsUrl + "/v1/wms/" + instanceID + "?SERVICE=WMS&REQUEST=GetCapabilities")
        .accept('xml')
        .parse(xml2jsParser)
        .end((err, res) => {
            if (res) {
                parseString(res.text, function (err, result) {
                    if (result) {
                        let layers = result.WMT_MS_Capabilities.Capability[0].Layer[0].Layer
                        var myRegexp = /^B[0-9][0-9A]/i; //excluse "B01", "B8A" etc. layer names
                        let i = 0
                        for (let l in layers) {
                            var layerName = layers[l].Name[0];
                            if (layerName === "FILL") {
                                buildMap();
                                return; //ugly hack to finish loop when we hit FILL and other default layers
                            }
                            if (!config.preset) {
                              config.preset = layerName; //set first layer as default selection
                            }
                            if (!myRegexp.test(layerName)) {
                                config.presets[layerName] = {
                                  name:  layers[l].Title[0],
                                  desc:  layers[l].Abstract[0],
                                  image: getMiniWmsUrl(layerName)
                                }
                            } else {
                                //fill bands
                                config.channels.push({
                                  name:  layerName,
                                  desc:  layers[l].Abstract[0].split("|")[0],
                                  color: (layers[l].Abstract[0].split("|")[1] !== undefined) ? layers[l].Abstract[0].split("|")[1] : "red"
                                });
                            }
                            i++;
                        }
                    }
                });
            } else if(!didLoop) {
                didLoop = true;
                location.reload();
            } else if (didLoop) {
                $("#mainLoader i").hide();
                $("#mainLoader span").removeClass("sr-only");
                $("#mainLoader span").text("Something went wrong. Please refresh webpage.");
            }
        })

});

function getMiniWmsUrl(preset) {
    return `${baseWmsUrl}/v1/wms/${instanceID}?SERVICE=WMS&REQUEST=GetMap&SHOWLOGO=false&LAYERS=${preset}&BBOX=-19482,6718451,-18718,6719216&MAXCC=20&WIDTH=40&HEIGHT=40&gain=1&FORMAT=image/jpeg&bgcolor=00000000&transparent=1&TIME=2015-01-01/2016-08-04`
}
function buildMap() {
    parseHash();
    var osm = L.tileLayer('http://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png', { attribution: '&copy; <a href="http://osm.org/copyright" target="_blank">OpenStreetMap</a>' })
    sentL = L.tileLayer.wms(baseWmsUrl + '/v1/wms/' + instanceID + '?showLogo=false',
        {
            attribution: '&copy; <a href="http://copernicus.eu/" target="_blank">Copernicus</a>, <a href="http://www.sinergise.com/" target="_blank">Sinergise</a>',
            layers: getLayersString(), tileSize: 512, crs: L.CRS.EPSG4326,
            minZoom: minScale,
            maxZoom: 16
        })

    NProgress.configure({ showSpinner: false, parent: "#mapid" });

    sentL.on('load', function (e) {
        NProgress.done();
    })
    sentL.on('loading', function (e) {
        NProgress.start();
        NProgress.inc(0.3);
    })
    sentL.on('tileerror', function (e) {
        NProgress.done();
        console.error("There was an error loading tile: " + e)
    })
    mapa = L.map('mapid', {
        center: [config.y, config.x],
        zoom: config.s,
        layers: [osm, sentL]
    })

    var overlayMaps = {
        "Sentinel 2": sentL
    };
    L.control.layers(null, overlayMaps).addTo(mapa);
    mapa.zoomControl.setPosition('bottomright');
    mapa.on('moveend', () => {
        toggleSentinelLayer()
        queryAvailableDates();
        updateHash()
    });
    toggleSentinelLayer()
    $(sentL.getContainer()).addClass('sentinelLayer');
    codeeditor = CodeMirror.fromTextArea(document.getElementById("editor"), {
        lineNumbers: true,
        mode: "javascript",
        lint: true
    });
    codeeditor.setValue("return [" + getMultipliedLayers(config.layers) + "]")
    codeeditor.setSize("98%", 150)
    codeeditor.on("change", function (cm) {
        config.evalscript = btoa(cm.getValue())
        updateHash()
    });
    L.control.scale({
        updateWhenIdle: true,
        imperial: false,
        position: "bottomleft"
    }).addTo(mapa);
    setDragula();
}

function toggleSentinelLayer() {
    if (mapa.getZoom() > (minScale - 1) && mapa.getZoom() < 17) {
        $("#outOfBounds").fadeOut()
        $(".buttonPanel").fadeIn()
    } else {
        $("#outOfBounds span").text(mapa.getZoom() < minScale ? "Zoom in to view Sentinel layer" : "Zoom out to view Sentinel layer");
        NProgress.done();
        $("#outOfBounds").fadeIn()
        $(".buttonPanel").fadeOut()
    }
    setMaxContentHeight()
}

var drake = dragula([colorsHolder, colTarR, colTarG, colTarB], {
    moves: function (el, target) {
        return true
    },
    accepts: function (el, target, source, sibling) {
        // return target !== colorsHolder && [colTarR, colTarG, colTarB].indexOf(source) < 1; // elements can be dropped in any of the `containers` by default
        return target !== colorsHolder; // elements can be dropped in any of the `containers` by default
    },
    copy: true
}).on('drop', (el, target, source, sibling) => {
    if ([colTarR, colTarG, colTarB].indexOf(source) > -1) {
        source.childNodes[0].remove();
        // delete config.layers[source.dataset.colPrefix]
        config.layers[source.dataset.colPrefix] = 'NULL'
    }
    if (target !== colorsHolder && target !== null) {
        config.layers[target.dataset.colPrefix] = el.textContent;
        updateSentinelLayer();
    }
    if (target === colorsHolder && source !== colorsHolder) {
        // el.remove();
    }
    if (target !== null) {
        if (target.childNodes.length > 1) {
            $.each(target.childNodes, function (key, value) {
                if (el !== value && value !== undefined) {
                    value.remove();
                }
            });
        }
    }
    codeeditor.setValue("return [" + getMultipliedLayers(config.layers) + "]")
    $("#colorsWrap").removeClass("ondrag")
    updateHash()
}).on('drag', (el, source) => {
    if (colorsHolder === source) {
        $("#colorsWrap").addClass("ondrag")
    }
});

function utoa(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
}
function atou(str) {
    return decodeURIComponent(escape(window.atob(str)));
}
function setDragula() {
    startControls();
    config.channels.map((col, i) => {
        return $("#colorsHolder").append("<div title='" + col.desc + "' style='background-color: " + col.color + "'>" + col.name + "</div>")
    });
}
function searchByVal(value, key, myArray) {
    var obj = myArray.filter(function (obj) {
        return obj[key] === value;
    })[0];
    return obj;
}


function startControls() {
    $("#tabs").tabs({
        collapsible: true
    });
    $("#geocomplete, #gotoLocation").geocomplete()
        .bind("geocode:result", function (event, result) {
            $(".searchHolder").removeClass("active");
            mapa.panTo([result.geometry.location.lat(), result.geometry.location.lng()]);
            queryAvailableDates();
        })
        .bind("geocode:error", function (event, status) {
            alert("An error occured. Please try again.");
        })
        .bind("geocode:multiple", function (event, results) {
        });

    for (let p in config.presets) {
        let item = $("<a data-preset='" + p + "'>" +
            config.presets[p].name + "<small>" + config.presets[p].desc + "</small></a>");
        if (p === "CUSTOM") {
            $(item).prepend("<i class='fa fa-paint-brush'></i>");
        } else {
            $(item).prepend("<img src='" + config.presets[p].image + "' />");
        }
        if (config.preset === p) {
            item.addClass("active");
        }
        $("#bandsPanel").append(item)
    }
    $("#bandsPanel a").click(function () {
        $("#bandsPanel a").removeClass("active");
        $(this).addClass("active");
        config.preset = $(this).data("preset")
        togglePresetsPanels();
        updateHash();
        doRefresh = true;
        updateSentinelLayer();
    })
    $("#advancedBack").click(function () {
        $("#advancedBands").hide();
        $("#bandsPanel").show();
    })
    $("#toggleBandMode").click(function () {
        $(this).toggleClass("script");
        toggleAdvancedPanels();
        checkNumLayers()
    })
    toggleAdvancedPanels();
    togglePresetsPanels();

    setMapHeight();
    siteUrl = window.location.href;
    if (siteUrl.indexOf("#") != -1) {
        siteUrl = (window.location.href).split("#")[0];
    }

    $("#refresh").click(function () {
        doRefresh = true;
        updateSentinelLayer()
    });
    $("#share").click(function () {
        doShare = true;
        updateSentinelLayer()
    });
    $("#print").click(function () {
        doGetImg = true;
        doRefresh = true;
        updateSentinelLayer()
    });

    map(config.effectsCBs, ({id, label, tooltip, param, value}, name) => {
        let checked = config[param].indexOf(value) > -1
        $("#effectsCBs").append("<div><input data-label='" + label + "' data-param='" + param + "' name='" + name + "'type='checkbox' data-value='" + value + "' " +
            (checked ? "checked" : "") + " id='" + id + "' /><label for='" + id + "'>" + label + "</label><abbr title='" + tooltip + "' style='margin-left:15px'>[?]</abbr></div>")
    })
    $("#effectsCBs input").change(function (e) {
        if (this.checked) {
            config[this.dataset.param].push(this.dataset.value);
        } else {
            let i = config[this.dataset.param].indexOf(this.dataset.value);
            if (i != -1) {
                config[this.dataset.param].splice(i, 1);
            }
        }
        updateSentinelLayer()
    })

    $("#floatSettings abbr").tooltip();

    $("#showSearch").click(function () {
        if ($(this).is(":visible")) {
            $("#geocomplete").focus();
        }
    });
    $("#toggleSettings").click(function () {
        $(this).toggleClass("open");
        $("#floatSettings").toggleClass("open");
        $(this).html($(this).hasClass("open") ? "<i class='fa fa-cogs'></i>" : "<i class='fa fa-chevron-left'></i>")
    });

    $("#cloudSlider").slider({
        range: "min",
        value: config.maxcc,
        min: 0,
        max: 100,
        step: 1,
        start: function (event, ui) {
        },
        stop: function (event, ui) {
            doRefresh = true;
            updateSentinelLayer();
            queryAvailableDates();
        },
        slide: function (event, ui) {
            $("#cloudSliderVal").text(ui.value + " %");
            config.maxcc = ui.value;
        }
    });
    $("#cloudSliderWrap").click(function (e) {
        e.stopPropagation();
    });
    $("#cloudFloat").click(function (e) {
        e.stopPropagation();
        if ($("#cloudSliderWrap").is(":visible")) {
            $("#cloudSliderWrap").hide();
            return;
        }
        $("#cloudSliderWrap").show();
    });
    $(".floatItem").click(function (e) {
        $(".floatItem").removeClass("active");
        if ($(this).hasClass("active")) {
            $(this).removeClass("active");
        } else {
            $(this).addClass("active");
        }
        if ($(this).attr("id") !== "cloudFloat") {
            if ($("#cloudSliderWrap").is(":visible")) {
                $("#cloudSliderWrap").hide();
            }
        }
        e.stopPropagation()
    })
    $("html").click(function () {
        $(".floatItem.active").removeClass("active");
        if ($("#cloudSliderWrap").is(":visible")) {
            $("#cloudSliderWrap").hide();
        }
    });
    $("#opacSlider").slider({
        range: "min",
        value: 100,
        min: 0,
        max: 100,
        step: 1,
        start: function (event, ui) {
        },
        stop: function (event, ui) {
        },
        slide: function (event, ui) {
            $("#opacSliderVal").text(ui.value + " %");
            sentL.setOpacity(ui.value / 100)
        }
    });

    $(".fa-calendar").click(function() {
        if ($("#liveDate1").datepicker( "widget" ).is(":hidden")) {
            $("#liveDate1").datepicker('show');
        }
    })
    $("#liveDate1").datepicker({
        changeMonth: true,
        firstDay: 1,
        changeYear: true,
        minDate: config.minDate,
        maxDate: moment().toDate(),
        dateFormat: "yy-mm-dd",
        onSelect: function (dateText, inst) {
            config.curDate = dateText;
            doRefresh = true;
            updateSentinelLayer();
        },
        beforeShowDay: isAvailable
    });

    $("#wmsDialog").dialog({
        autoOpen: false,
        resizable: false,
        show: "fade",
        modal: true,
        width: "auto",
        maxWidth: 650,
        height: $(window).height() > 700 ? 680 : $(window).height() - 40,
        open: function (event, ui) {
            $('.ui-widget-overlay').bind('click', function () {
                $("#wmsDialog").dialog('close');
            });
        }
    });

    $("#helpDialog").dialog({
        autoOpen: false,
        modal: true,
        dialogClass: "helpDialog",
        show: "fade",
        resizable: false,
        title: "About Postcards",
        height: $(window).height() > 700 ? 680 : $(window).height() - 40,
        width: $(window).width() > 700 ? ($(window).height() < 700 ? 665 : 650) : $(window).width() - 40,
        open: function (event, ui) {
            Cookies.set("hasHelp", "viewed", { expires: 365 });
        },
        close: function (event, ui) {
        }
    });
    $("#helpConfirm").click(function () {
        $("#helpDialog").dialog('close');
    });


    $("#errorDialog").dialog({
        autoOpen: false,
        modal: true,
        width: 400,
        title: "Error",
        dialogClass: "errorDialog"
    });

    $("#loadingDialog").dialog({
        autoOpen: false,
        show: "fade",
        width: 300,
        dialogClass: "loadingDialog"
    });

    $("#gain").slider({
        value: config.gain,
        min: 0.1,
        max: 3,
        step: 0.1,
        slide: function (event, ui) {
            $("#gainVal").text(ui.value);
        },
        stop: function (even, ui) {
            config.gain = ui.value;
            updateSentinelLayer()
        }
    });

    $("#sortMode").change(function (e) {
        if ($(this).val() === "singleDate") {
            config.priority = "mostRecent"
        } else {
            config.priority = $(this).val()
        }
        updateSentinelLayer()
    })

    updateSentinelLayer()
    updateGui()
    queryAvailableDates()

    $("#mainLoader").fadeOut();
}

function toggleAdvancedPanels() {
    if ($("#toggleBandMode").hasClass("script")) {
        $("#colorsWrap").hide();
        $("#editorHolder").show();
    } else {
        $("#colorsWrap").show();
        $("#editorHolder").hide();
    }
    codeeditor.refresh();

}

function updateGui() {
    $("#presetMode").val(config.preset)
    $("#gain").slider("value", config.gain);
    $("#gainVal").text($("#gain").slider("value"));
    $("#cloudSlider").slider("value", config.maxcc);
    $("#cloudSliderVal").text($("#cloudSlider").slider("value") + " %");
    $("#opacSliderVal").text($("#opacSlider").slider("value"));
    $("#liveDate1").datepicker("setDate", config.curDate);
    mapa.setView([config.y, config.x], config.s);
    let allCbs = config.CLOUDCORRECTION.concat(config.COLCOR)
    $("#effectsCBs input").each(function () {
        $(this).prop("checked", allCbs.indexOf($(this).data("value")) > -1)
    })
    togglePresetsPanels()

    $.each(objectValueToString(config.layers).split(","), function (index, value) {
        if (value === "NULL") return;
        var obj = searchByVal(value, "name", config.channels)
        $(".colHolder:eq(" + index + ")").html("<div style='background-color:" + obj.color + "' title='" + obj.desc + "'>" + obj.name + "</div>")
    })
    checkNumLayers()
    setMaxContentHeight()
}

function wgs84ToMercator(point) {
    var sourceCRS = proj4.Proj('EPSG:4326');
    var destCRS = proj4.Proj('EPSG:3857');
    var pt = new proj4.toPoint([point.lng, point.lat]);
    proj4.transform(sourceCRS, destCRS, pt);
    return pt;
}

function isCustom() {
    return config.preset === "CUSTOM";
}
function togglePresetsPanels() {
    if (isCustom()) {
        $("#advancedBands").show();
        $("#bandsPanel").hide();
    } else {
        $("#advancedBands").hide();
        $("#bandsPanel").show();
    }
}

function checkNumLayers() {
    if (isCustom() && $("#toggleBandMode").hasClass("script") ) {
        $("#warning").hide();
        $(".buttonPanel button").prop("disabled", false);
        return;
    }
    for (let a in config.layers) {
        if (config.layers[a] === 'NULL' && isCustom()) {
            doRefresh = false;
            $(".buttonPanel button").prop("disabled", true);
            $("#warning").show();
            return;
        } else {
            $("#warning").hide();
            $(".buttonPanel button").prop("disabled", false);
        }
    }
}

function updateHash() {
    let scale = config.s = mapa.getZoom()
    let x = mapa.getCenter().lng
    let y = mapa.getCenter().lat
    var pt = wgs84ToMercator(mapa.getCenter())
    config.x = x
    config.y = y
    currentCoords = calcBboxFromXY(pt.x, pt.y, scale, imgWidth, imgHeight);
    hashVal = "x=" + x + "%2By=" + y + "%2Bs=" + config.s;
    hashVal += "%2Bpreset=" + config.preset;
    hashVal += "%2Blayers=" + getLayersString();
    hashVal += "%2Bmaxcc=" + config.maxcc;
    hashVal += "%2Bgain=" + config.gain;
    hashVal += "%2Btime=" + getDateRange();
    hashVal += "%2Bpriority=" + config.priority;
    if (!isEmpty(config.CLOUDCORRECTION))
        hashVal += "%2BCLOUDCORRECTION=" + objectValueToString(config.CLOUDCORRECTION);
    if (!isEmpty(config.COLCOR))
        hashVal += "%2BCOLCOR=" + objectValueToString(config.COLCOR);
    checkNumLayers()

    wmsUrl = generateWmsUrl(pt.x, pt.y, scale);
    document.location.hash = hashVal;
    console.log('updateHash', doRefresh)
    doRefresh = false;
    if (doGetImg) {
        if (scale > 15 || scale < minScale) {
            if (scale > 15) {
                mapa.setView([x, y], scale - 1, { animation: true });
            } else {
                mapa.setView([x, y], scale + 1, { animation: true });
            }
            doGetImg = false;
            return;
        }
        $("#errorPanel").hide();
        $('#loadingDialog').dialog('open');
        if ($("#errorDialog").dialog("isOpen") === true) {
            $(this).dialog('close');
        }
        if ($("#wmsDialog").dialog("isOpen") === true) {
            $(this).dialog('close');
        }
        createPostcard();
        doGetImg = false;
    }
}

function optimalWSize() {
    var a = [];
    a.push($(window).width() - 50);
    a.push($(window).height() - 100);
    return a;
}

function calcBboxFromXY(x, y, zoomLevel, imgW, imgH) {
    var scale = 40075016 / (512 * Math.pow(2, (zoomLevel - 1)));
    let arr = [];
    arr.push(Math.floor(x - 0.5 * imgW * scale));
    arr.push(Math.floor(y - 0.5 * imgH * scale));
    arr.push(Math.floor(x + 0.5 * imgW * scale));
    arr.push(Math.floor(y + 0.5 * imgH * scale));
    return arr;
}


function generateWmsUrl(x, y, scale) {
    var tempUrl = wmsUrlPrefix;
    tempUrl += "&LAYERS=" + getLayersString();
    var tempArr = calcBboxFromXY(x, y, scale, optimalWSize()[0], optimalWSize()[1]);
    tempUrl += "&BBOX=" + tempArr[0] + "," + tempArr[1] + "," + tempArr[2] + "," + tempArr[3];
    tempUrl += "&MAXCC=" + config.maxcc;
    tempUrl += "&WIDTH=" + optimalWSize()[0] + "&HEIGHT=" + optimalWSize()[1];
    tempUrl += "&gain=" + $("#gain").slider("value");
    tempUrl += "&FORMAT=image/jpeg";
    tempUrl += "&bgcolor=" + bgColor;
    tempUrl += "&transparent=1";
    tempUrl += "&TIME=" + getDateRange();
    if (!isEmpty(config.CLOUDCORRECTION))
        tempUrl += "&CLOUDCORRECTION=" + objectValueToString(config.CLOUDCORRECTION);
    tempUrl += "&COLCOR=" + objectValueToString(config.COLCOR);
    if (isCustom()) {
        tempUrl += ",BOOST";
    }
    return tempUrl;
}

function showError(selector) {
    $(selector).on("error", function () {
        console.log("Error occured for wms: " + $(this).attr("src"));
        $('#loadingDialog').dialog('close');
        $('#errorDialog').dialog('open');
        $("#errorPanel").show();
        $("#errorPanel").html("An error occured loading image. Please try again later.");
    });
}

function createPostcard() {
    $("#wmsResult").html("<img src='" + wmsUrl + "' />");
    $("#downloadWms").attr("download", "Sentinel2A_" + getDateFromPicker()+"_"+config.preset+".jpg");
    $("#downloadWms").attr("href", wmsUrl+"&NICENAME="+"Sentinel2A_" + getDateFromPicker()+"_"+config.preset+".jpg");
    $("#wmsResult").show();
    allImagesLoaded([wmsUrl], afterPostcard);
    showError("#wmsResult img");
}
function afterPostcard() {
    showImageDialog("#wmsDialog", "Sentinel-2A imagery for date: " + getDateFromPicker(),
        "auto",
        function() {
            $("#wmsDialog").dialog("option", "height", $("#wmsResult").outerHeight() + $(".ui-dialog-titlebar").outerHeight());
        });
}

function isAvailable(date) {
    let dmy = moment(date).format("YYYY-MM-DD");
    if ($.inArray(dmy, config.availableDays) != -1) {
        return [true, "available", "Date with available data"];
    } else {
        return [true, "unavailable", "No data available on this date"];
    }
}

function queryAvailableDates() {
    let arr = mapa.getBounds().toBBoxString().split(",");
    let ne = wgs84ToMercator(mapa.getBounds()._northEast)
    let sw = wgs84ToMercator(mapa.getBounds()._southWest)
    let minX = parseFloat(sw.x);
    let minY = parseFloat(sw.y);
    let maxX = parseFloat(ne.x);
    let maxY = parseFloat(ne.y);

    var coords = [];
    coords.push([minX, minY]);
    coords.push([maxX, minY]);
    coords.push([maxX, maxY]);
    coords.push([minX, maxY]);
    coords.push([minX, minY]);
    var polygon = {
        "type": "Polygon",
        "crs": {
            "type": "name",
            "properties": {
                "name": "urn:ogc:def:crs:EPSG::3857"
            }
        },
        "coordinates": [
            coords
        ]
    };
    var url = baseIndexUrl + "/index/v1/finddates?timefrom=" + config.minDate + "&timeto=" + moment().format("YYYY-MM-DD") + "&maxcc=" + config.maxcc / 100;
    request.post(url)
        .set('Content-Type', 'application/json')
        .type('json')
        .send(polygon)
        .end((err, res) => {
            if (!err) {
              config.availableDays = JSON.parse(res.text);
                if (searchPlace) {
                    searchPlace = false;
                }
            }
        })

}


function showImageDialog(selector, title, height, customFunction) {
    $(selector).dialog('open');
    $(selector).dialog({
        position: { my: "center", at: "center", of: window }
    });
    $(selector).dialog('option', 'height', height);
    $(selector).dialog('option', 'title', title);
    $('#loadingDialog').dialog('close');
    customFunction();
}


function allImagesLoaded(urls, func) {
    var imgs = [];
    var cnt = 0;

    for (var i = 0; i < urls.length; i++) {
        var img = new Image();
        img.onload = function () {
            ++cnt;
            if (cnt >= urls.length) {
                func();
            }
        };
        img.src = urls[i];
        imgs.push(img);
    }
}
function getMultipliedLayers(layers) {
  let result = []
  for (let layer in layers) {
    if(layers.hasOwnProperty(layer)) {
      result.push(`${layers[layer]}*2.5`) //we need to multiply each layer to get appropriate gain
    }
  }
  return result.join(",")
}

function objectValueToString(obj) {
    let arr = []
    for (var l in obj) {
        if (obj[l] !== "") arr.push(obj[l]);
    }
    return arr.join(",");
}
function getLayersString() {
    return isCustom() ? objectValueToString(config.layers) : config.preset
}

function getDateRange() {
    return $("#sortMode").val() === "singleDate" ? config.curDate + "/" + config.curDate : config.minDate + "/" + config.curDate
}
function updateSentinelLayer() {
    let date = getDateRange();
    let layers = getLayersString()
    let cloudcor = objectValueToString(config.CLOUDCORRECTION)
    let colcors = objectValueToString(config.COLCOR)
    let evalS = ""
    if (isCustom()) {
        colcors += ",BOOST"
        evalS = config.evalscript
    }
    console.log('updateSentinelLayer', doRefresh, {config, date, layers, cloudcor, colcors, evalS})
    if (doRefresh) {
        sentL.setParams({
            maxcc: config.maxcc,
            layers: layers,
            priority: config.priority,
            gain: config.gain,
            evalscript: evalS,
            COLCOR: colcors,
            CLOUDCORRECTION: cloudcor,
            time: date
        });
    }
    updateHash()
}

function parseHash() {
    let wHash = document.location.hash.replace(/#/g, '');
    wHash = wHash.replace(/\+/g, '%2B');
    var arr = wHash.split("%2B");
    if (arr.length < 2) {
        document.location.hash = "";
        return;
    }
    noHash = false;
    if (wHash.indexOf("showImage") != -1) {
        doGetImg = true;
    }
    var hashObj = {}
    $.each(arr, function (index, value) {
        let i = value.split("=")
        if (i[0] === "layers") {
            if (isCustom()) {
                let lO = {};
                let rgb = ["r", "g", "b"]
                let lA = i[1].split(",")
                for (let l in lA) {
                    if (lA[l] !== "") {
                        lO[rgb[l]] = lA[l]
                    }
                }
                config.layers = lO;
            }
        } else if (i[0] === "time") {
            config.curDate = i[1].split("/")[1]
        } else if (i[0] === "COLCOR" || i[0] === "CLOUDCORRECTION") {
            let array = stringToArray(i[1]);
            hashObj[i[0]] = array;
        } else {
            if (i[0] === "preset") {
                config.preset = i[1];
            } else {
                hashObj[i[0]] = i[1];
            }
        }
    })
    doRefresh = true
    //lodash merges both objects into one and returns updated config
    merge(config, hashObj)
}

function stringToArray(string) {
    let arr = string.split(",");
    return string.split(",");
}


function getDateFromPicker() {
    return $("#liveDate1").val();
}

function setMapHeight() {
    imgWidth = $(window).width() > 800 ? 640 : $(window).width() - 60;
    imgHeight = $(window).height() > 800 ? 640 : $(window).height() - 120;
}

function setMaxContentHeight() {
    $(".ui-tabs-panel").css("max-height", $(window).height() -
        ($("#logo").outerHeight() + $(".ui-tabs-nav").outerHeight() + $("#outOfBounds").outerHeight() + $(".buttonPanel").outerHeight() + 55)
    )
}

$(window).resize(function () {
    setMapHeight();
    setMaxContentHeight()
});
