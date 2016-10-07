export const effectsCB = {
    "Atmospheric correction": {
        initial: true,
        param: "",
        id: "effCb1"
    },
    "DOS-1": {
        initial: false,
        param: "",
        id: "effCb2"
    },
    "Enhanced": {
        initial: false,
        param: "",
        id: "effCb3"
    },
    "Cloud replacement": {
        initial: true,
        param: "CLOUDCORRECTION",
        id: "effCb5"
    }
}
export const effectsSliders = {
    "Gamma": {
        initial: 1,
        step: 0.1,
        max: 3,
        param: "GAMMA",
        id: "s1"
    }
}
export const sortModes = [
    {label: "Most recent on top", value: "mostRecent" },
    {label: "Single date", value: "leastTimeDifference" },
    {label: "Least cloud on top", value: "leastCC" }
]