import webpack from 'webpack'
import path    from 'path'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import CopyWebpackPlugin  from 'copy-webpack-plugin'
import CleanWebpackPlugin from 'clean-webpack-plugin';

const TARGET   = process.env.npm_lifecycle_event
// start: development
// build: production
const NODE_ENV = 'build' == TARGET ? 'production' : 'development'

let minimize  = false
let debug     = true
let publicDir = path.join(__dirname, 'build')

if ('production' == NODE_ENV) {
    minimize = true
    debug    = false
} else {
    publicDir = path.join(__dirname, 'build')
}


let config = {
    plugins: [
        new webpack.ProvidePlugin({
            $: "jquery",
            "jQuery": "jquery"
        }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': `'${NODE_ENV}'`
        }),
        new webpack.LoaderOptionsPlugin({
            minimize,
            debug
        }),
        new HtmlWebpackPlugin({
            template: 'app/index.html',
            title: 'SentiArt'
        }),
        new CopyWebpackPlugin([
            { from: 'app/static', to: 'static' }
        ],{})
    ],

    modules: [
        './app',
        'node_modules'
    ],

    entry: [
        './app/index.js'
    ],
    module: {
        loaders: [
            {
                test: /\.js?$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'babel',
                query: {
                    cacheDirectory: true,
                    presets: ['es2015-native-modules', 'stage-0']
                }
            },
            {
                test: /\.(otf|svg|ttf|woff|woff2|eot|jpg|png|gif)/,
                loader: 'url',
                query: {
                    limit: 1024
                }
            },
            {
                test: /\.json?$/,
                loader: 'json-loader'
            }
        ]
    },
    postLoaders: [
      {
        test: /\.jsx?$/,
        loader: "transform/cacheable?brfs"
      }
    ],
    output: {
        path:       publicDir,
        filename:  '[hash].js'
    },

    resolve: {
        extensions: [
            '.js', '.json', '.jsx'
        ]
    },

    devServer: {
        contentBase: publicDir,
        proxy: {
            "/socket.io/*": "http://localhost:3000"
        }
    }
}

if (minimize) {
    const opt      = webpack.optimize
    config.plugins = config.plugins.concat([
        new opt.DedupePlugin(),
        new opt.AggressiveMergingPlugin(),
        new opt.UglifyJsPlugin({
            compress: {
                warnings: false,
            },
            output: {
                comments: false
            }
        })
    ])
} else {
    config.devtool = 'eval'
}

export default config
