import moment from 'moment';
module.exports = {
    layers: {
        r: "B04",
        g: "B03",
        b: "B02"
    },
    x:-0.09,
    y:51.51,
    s: 13,
    priority: 'mostRecent',
    mosaic: 'mostRecent',
    evalscript: '',
    opacity: 100,
    maxcc: 20,
    wmsUrl: "",
    minDate: "2015-01-01",
    curDate: moment().format("YYYY-MM-DD"),
    availableDays: [],
    preset: "1_NATURAL_COLOR",
    channels: [],
    presets: {
        "CUSTOM": {
            name: "Custom",
            desc: "Create custom rendering",
            image: "image.jpg"
        },
    },
    effectsCBs: {
        "SenCor": {
            checked: false,
            label: "Atmospheric correction",
            value: "SenCor",
            param: "COLCOR",
            id: "effCb1",
            tooltip: "It removes ...."
        },
        "CLOUDCORRECTION": {
            checked: false,
            label: "Cloud replacement",
            value: "replace",
            param: "CLOUDCORRECTION",
            id: "effCb3",
            tooltip: "It removes ...."
        }
    },
    "COLCOR": [],
    "CLOUDCORRECTION": [],
    "gain": 1
}
