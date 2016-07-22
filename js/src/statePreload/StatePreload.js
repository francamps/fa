/*
 * This is the first state when the page has been returned from the server
 *
 * It checks the url and handles the routing
 *
 * Loads common resources
 */

FA.StatePreload = function( app ) {

    var is3Dloaded = false,
        messageCompleted = false,
        manager,

        isTimeUp = false,
        intervalId,
        secondsCounter = 0,
        maxSeconds = 2,

        $btnSkip = $( '#layer-intro .btn-skip' ),
        $spinner = $( '#layer-intro .intro-spinner' ),

        $player = $('#layer-intro .video-container'),
        player,
        isVideoReady = false,
        isVideoStarted = false,
        isSoundLoaded = false,

        // router
        bSkipVideo = false,
        nextState,


        slowLoopIntervalId;


    // ----------------------------------------------------------------------------------------

    // maps the url with an application state (explore, video...)
    // TODO: create FA.Router to process url and return a state
    // eg: FA.Router.getState( url ) <-- will return the state to pass to FA.App.changeState
    function processUrl() {

        var urlVars = getUrlVars( History.getState().url ),
            kind = urlVars[ 'kind' ],
            id = urlVars[ 'id' ],
            title;

        // video
        if ( kind === 'video' )
        {
            var isValid = FA.App.data.mediaById[ id ];

            if ( isValid ) {
                nextState = new FA.StateVideo2( FA.App, id );
            } else {
                // error: url not found
            }
            return;
        }

        // location (aka 360)
        if ( kind === 'location' )
        {
            var isValid = FA.App.data.locationBySlug[ id ];

            if ( isValid ) {
                nextState = new FA.State360( FA.App, id );
            } else {
                // error: url not found
            }
            return;
        }

        // default next state
        nextState = new FA.StateExplore( app );


        // http://stackoverflow.com/questions/4656843/jquery-get-querystring-from-url
        function getUrlVars( hashString ) {

            var vars = {},
                hash,
                hashes = hashString.slice( hashString.indexOf( '?' ) + 1 ).split( '&' );
            for ( var i = 0; i < hashes.length; i++ ) {
                hash = hashes[ i ].split( '=' );
                vars[ hash [ 0 ] ] = hash[ 1 ];
            }
            return vars;

        }

    }




    // end history listener
    // ----------------------------------------------------------------------------------------


    function loadData( onComplete ) {

        var url;
        if ( location.hostname === 'localhost' ) {
            url = 'http://localhost:8888/saydnaya/data/data.json';
        } else {
            url = 'data/data.json';
        }

        $.ajax({
            dataType: 'json',
            url : url,
            success : function( result ) {

                app.data = new FA.Data( result );

                onComplete();
            },
            error : function( jqXHR, status, errorThrown ) {

                console.log( status, errorThrown );
            }
        });
    }


    function loadSound() {

        // create the sound for the main screen
        ion.sound({
            sounds: [
                {
                    name: app.data.mainScreenSound.ambient,
                    loop: true
                },
            ],

            // main config
            path: "sound/",
            preload: true,
            multiplay: true,
            // volume: 0.9
            ready_callback: function() {
                isSoundLoaded = true;
            }
        });

    }


    function loadResources() {

        // blocks until loaded

        manager = new THREE.LoadingManager();
        manager.onProgress = function ( item, loaded, total ) {
            // console.log( item, loaded, total );
        };

        manager.onLoad = function() {
            is3Dloaded = true;

            showSkip();
        }

        loadBuildingModel();
        loadTerrain();
        loadRooms();

    }


    function loadBuildingModel() {

        // Main building model
        var loader = new THREE.JSONLoader( manager );
        loader.setTexturePath( 'obj/building/maps/' )
        loader.load(
            'obj/building/building.js',
            function ( geometry, materials ) {
                var material = new THREE.MultiMaterial( materials );
                for (var i = 0; i < materials.length; i++) {
                    materials[ i ].transparent = true;
                }

                scaleGeometry( geometry );

                app.buildingMesh = new THREE.Mesh( geometry, material );
                app.buildingMesh.geometry.computeBoundingSphere();
            },
            onProgress,
            onError
        );

        // Main building roof
        var loader = new THREE.JSONLoader( manager );
        loader.load(
            'obj/building/building-roof.js',
            function ( geometry, materials ) {
                var material = new THREE.MultiMaterial( materials );
                for (var i = 0; i < materials.length; i++) {
                    materials[ i ] = new THREE.MeshPhongMaterial( {
                        color : 0xffffff,
                        transparent : true,
                        polygonOffset : true,
                        polygonOffsetFactor : 1, // positive value pushes polygon further away
                        polygonOffsetUnits : 1
                    } );
                }

                scaleGeometry( geometry );

                app.buildingRoofMesh = new THREE.Mesh( geometry, material );
            },
            onProgress,
            onError
        );

    }


    function loadRooms() {

        var roomData = app.data.locations;

        for ( var i = 0; i < roomData.length; i++ ) {
            loadRoom( roomData[ i ] );
        }

        function loadRoom( data ) {
            var name = data.name,
                slug = data.slug,
                loader = new THREE.JSONLoader( manager );

            loader.load(
                data.objRoom,
                function ( geometry, materials ) {
                    //var bufferGeom = new THREE.BufferGeometry();
                    //bufferGeom.fromGeometry( geometry );
                    var material = new THREE.MeshPhongMaterial( {
                        color : 0xffffff
                    } );

                    scaleGeometry( geometry );

                    var mesh = new THREE.Mesh( geometry, material );
                    var room = new FA.InteractiveItem( mesh, name, slug );
                    room.setEmissiveDefault( 0x333333 );
                    room.unmark();

                    app.rooms.push( room );
                },
                onProgress,
                onError
            );
        }

    }


    function loadTerrain() {

        var loader = new THREE.JSONLoader( manager );
        loader.setTexturePath( 'obj/terrain/maps/' )
        loader.load(
            'obj/terrain/terrain.js',
            function ( geometry, materials ) {
                for (var i = 0; i < materials.length; i++) {
                    materials[ i ].transparent = true;
                }
                var material = new THREE.MultiMaterial( materials );

                scaleGeometry( geometry );

                app.terrainMesh = new THREE.Mesh( geometry, material );;
            },
            onProgress,
            onError
        );

    }


    function scaleGeometry( geometry ) {

        // centers the imported models into the scene
        var transform = new THREE.Matrix4(),
            scale = new THREE.Matrix4(),
            translate = new THREE.Matrix4();
        scale.makeScale( 0.2, 0.2, 0.2 );
        translate.makeTranslation( 32.57, 0, 30 );
        transform.multiplyMatrices( scale, translate );

        geometry.applyMatrix( transform );

    }


    function onProgress( xhr ) {
        // if ( xhr.lengthComputable ) {
        //     var percentComplete = xhr.loaded / xhr.total * 100;
        //     console.log( Math.round(percentComplete, 2) + '% downloaded' );
        // }
    };


    function onError( xhr ) {};


    function goToNextState() {

        $( '#layer-prison' ).css( 'display', 'block' );

        // fadeout intro
        $( "#layer-intro" ).transition( { opacity: 0 }, 500, 'out',
            function() {
                player.dispose();

                this.remove();

                app.changeState( nextState );
            }
        );

    }


    function buidlVideo() {

        $player.html(
            '<video id="video_0" class="video-js vjs-default-skin vjs-fill" controls preload="none" width="640" height="264" poster="">' +
              '<p class="vjs-no-js">To view this video please enable JavaScript, and consider upgrading to a web browser that <a href="http://videojs.com/html5-video-support/" target="_blank">supports HTML5 video</a></p>' +
            '</video>'
        );
        $player.css( { 'display': 'none', 'opacity': 0 } );

        // init videojs
        player = videojs(
            "video_0",
            {
                controlBar: {
                    volumeMenuButton: false,
                    fullscreenToggle: false
                }
            },
            function() {
                // Player is initialized and ready.
                isVideoReady = true;
            }
        );

        player.on( 'ended', function() {
            goToNextState();
        } );

    }


    function startVideo() {

        $player
            .css('display', 'block')
            .transition( { opacity: 1 }, 500, 'in',
                function() {
                    $('#introMessage').css('visibility', 'hidden'); // hide message
                }
            );

        player.src( [
            { type: "video/mp4", src: app.data.introVideo.hd }
            // { type: "video/mp4", src: app.data.introVideo.sd }
        ] );

        player.play();

        isVideoStarted = true;

    }


    function startTimer() {

        intervalId = setInterval( function() {
            secondsCounter++;

            if ( secondsCounter > maxSeconds ) {
                clearInterval( intervalId );
                isTimeUp = true;
            }

        }, 1000 );

    }


    function showSkip() {

        $btnSkip
            .css( { visibility: 'visible', opacity: 0 } )
            .transition( { opacity: 1 }, 500, 'in')
            .on( 'click', function( e ) {

                goToNextState();

            });

        $spinner.transition( { opacity: 0 }, 200, 'out');
        $spinner.transition( { height: 0, delay: 0 }, 300, 'out');

    }



    function waitForLoading() {

        // check if everything loaded every 500ms
        slowLoopIntervalId = setInterval( function() {
            if ( is3Dloaded  &&  isSoundLoaded  &&  isVideoReady  &&  isTimeUp ) { //  &&  !isVideoStarted   ) {

                // console.log( is3Dloaded, isVideoReady, isVideoStarted, isTimeUp );

                if ( bSkipVideo ) {
                    goToNextState();
                } else {
                    startVideo();
                }
                clearInterval( slowLoopIntervalId );
            }
        }, 500 );

    }


    //        //
    // Public //
    //        //


    // info about this state
    this.getStateData = function() {

        return {
            kind: 'preload'
        }

    }


    this.enter = function() {

        // hide layers
        $( '#layer-prison, #layer-video' ).css( 'display', 'none' );

        $( '#layer-prison' ).css( 'opacity', 1 );

        $( '#introMessage .centered' ).transition( { opacity: 1 }, 900, 'in');

        // prepare the player
        buidlVideo();

        // load json  resources
        loadData( function() {
            // and then load 3d + sound
            loadResources();
            loadSound();
            // process the current url once we've got access to the data
            processUrl();
        } );

        // whait at least two seconds before starting video
        // this ensures that the user will see the intro text for at least maxSeconds
        // before launching the video
        startTimer();

        waitForLoading();

    }


    this.update = function() {

    }


    this.exit = function() {

        if ( intervalId ) {
            clearInterval( intervalId );
            clearInterval( slowLoopIntervalId );
        }

        $btnSkip.off();

    }

}
