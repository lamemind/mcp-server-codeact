import * as util from 'util';
/**
 * Utility function for delaying execution
 * @param ms Number of milliseconds to sleep
 */
export const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
export const dump = (obj, message = null) => {
    if (message)
        console.error(message, util.inspect(obj, { depth: null, colors: true }));
    else
        console.error(util.inspect(obj, { depth: null, colors: true }));
};
