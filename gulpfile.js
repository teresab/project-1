var fs = require('fs');
var path = require('path');

var async = require('async');
var gulp = require('gulp');
var gutil = require('gulp-util');
var logSymbols = require('log-symbols');
var plugins = require('gulp-load-plugins')(); // Load all gulp plugins
                                              // automatically and attach
                                              // them to the `plugins` object

var runSequence = require('run-sequence');    // Temporary solution until gulp 4
                                              // https://github.com/gulpjs/gulp/issues/355
var template = require('lodash').template;

var pkg = require('./package.json');
var dirs = pkg['h5bp-configs'].directories;

// ---------------------------------------------------------------------
// | Helper functions                                                  |
// ---------------------------------------------------------------------

function logError(msg) {
    gutil.log(logSymbols.error + ' ' + msg);
}

function logSuccess(msg) {
    gutil.log(logSymbols.success + ' ' + msg);
}

var createArchive = function (dir, archive, done) {

    var archiveName = path.resolve(archive);
    var archiver = require('archiver')('zip');
    var files = require('glob').sync('**/*.*', {
        'cwd': dir,
        'dot': true // include hidden files
    });
    var output = fs.createWriteStream(archiveName);

    archiver.on('error', function (error) {
        done();
        throw error;
    });

    output.on('close', done);

    files.forEach(function (file) {

        var filePath = path.resolve(dir, file);

        // `archiver.bulk` does not maintain the file
        // permissions, so we need to add files individually
        archiver.append(fs.createReadStream(filePath), {
            'name': file,
            'mode': fs.statSync(filePath)
        });

    });
    archiver.pipe(output);
    archiver.finalize();

};

var copyHtaccess = function (dir, done) {
    gulp.src('node_modules/apache-server-configs/dist/.htaccess')
               .pipe(plugins.replace(/# ErrorDocument/g, 'ErrorDocument'))
               .pipe(gulp.dest(dir))
               .on('error', function () { logError(dir + '.htaccess'); })
               .on('end', function () { logSuccess(dir + '.htaccess'); done(); });
};

var copyIndexPage = function (dir, done) {
    gulp.src(template('<%= src %>/index.html', dirs))
               .pipe(plugins.replace(/{{JQUERY_VERSION}}/g, pkg.devDependencies.jquery))
               .pipe(gulp.dest(dir))
               .on('error', function () { logError(dir + 'index.html'); })
               .on('end', function () { logSuccess(dir + 'index.html'); done(); });
};

var copyjQuery = function (dir, done) {
    gulp.src(['node_modules/jquery/dist/jquery.min.js'])
               .pipe(plugins.rename('jquery-' + pkg.devDependencies.jquery + '.min.js'))
               .pipe(gulp.dest(dir + '/js/vendor'))
               .on('error', function () { logError(dir + 'js/vendor'); })
               .on('end', function () { logSuccess(dir + 'js/vendor'); done(); });
};

var copyMainCSSPage = function (dir, done) {

    var banner = '/*! HTML5 Boilerplate v' + pkg.version +
                    ' | ' + pkg.license.type + ' License' +
                    ' | ' + pkg.homepage + ' */\n\n';

    gulp.src(template('<%= src %>/css/main.css', dirs))
               .pipe(plugins.header(banner))
               .pipe(gulp.dest(dir + '/css'))
               .on('error', function () { logError(dir + 'css/main.css'); })
               .on('end', function () { logSuccess(dir + 'css/main.css'); done(); });

};

var copyMiscellaneous = function (dir, done) {
    gulp.src([

        // Copy all files
        template('<%= src %>/**/*', dirs),

        // Exclude the following files
        // (other tasks will handle the copying of these files)
        template('!<%= src %>/css/main.css', dirs),
        template('!<%= src %>/index.html', dirs)

    ], {

        // Include hidden files by default
        dot: true

    }).pipe(gulp.dest(dir))
      .on('error', function () { logError(dir + '...'); })
      .on('end', function () { logSuccess(dir + '...'); done(); });
};

var copyNormalize = function (dir, done) {
    gulp.src('node_modules/normalize.css/normalize.css')
               .pipe(gulp.dest(dir + '/css'))
               .on('error', function () { logError(dir + 'css/normalize'); })
               .on('end', function () { logSuccess(dir + 'css/normalize'); done(); });
};

var copyBaseFiles = function (dir, done) {
    async.parallel([
        async.apply(copyIndexPage, dir),
        async.apply(copyjQuery, dir),
        async.apply(copyMainCSSPage, dir),
        async.apply(copyMiscellaneous, dir),
        async.apply(copyNormalize, dir)
    ], function() {
        done();
    });
};

// ---------------------------------------------------------------------
// | Helper tasks                                                      |
// ---------------------------------------------------------------------

gulp.task('archive:create_archives', function (done) {

    async.parallel([
        async.apply(createArchive, dirs.dist.base, dirs.archive + '/' + pkg.name + '_v' + pkg.version + '.zip'),
        async.apply(createArchive, dirs.dist.apache, dirs.archive + '/' + pkg.name + '_v' + pkg.version + '+apache.zip')
    ], function() {
        done();
    });
});

gulp.task('archive:create_archive_dir', function () {
    fs.mkdirSync(path.resolve(dirs.archive), '0755');
});

gulp.task('build:h5bp', function (done) {
    copyBaseFiles(dirs.dist.base, done);
});

gulp.task('build:h5bp+apache', function (done) {

    var dir = dirs.dist.apache;

    async.parallel([
        async.apply(copyHtaccess, dir),
        async.apply(copyBaseFiles, dir)
    ], function () {
        done();
    });

});

gulp.task('clean', function (done) {
    require('del')([
        template('<%= archive %>', dirs),
        template('<%= dist.base %>', dirs),
        template('<%= dist.apache %>', dirs)
    ], done);
});

gulp.task('lint:js', function () {
    return gulp.src([
        'gulpfile.js',
        template('<%= src %>/js/*.js', dirs),
        template('<%= test %>/*.js', dirs)
    ]).pipe(plugins.jscs())
      .pipe(plugins.jshint())
      .pipe(plugins.jshint.reporter('jshint-stylish'))
      .pipe(plugins.jshint.reporter('fail'));
});

// ---------------------------------------------------------------------
// | Main tasks                                                        |
// ---------------------------------------------------------------------

gulp.task('archive', function (done) {
    runSequence(
        'build',
        'archive:create_archive_dir',
        'archive:create_archives',
    done);
});

gulp.task('build', function (done) {
    runSequence(
        ['clean', 'lint:js'],
        ['build:h5bp+apache', 'build:h5bp'],
    done);
});

gulp.task('default', ['build']);
