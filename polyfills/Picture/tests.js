var pf = picturefill._;

it('get width from length', function () {
	expect(pf.getWidthFromLength("750px")).to.be(750);
	expect(pf.getWidthFromLength("calc(160px + 1de)")).to.be(false);
});

it('find width from source size', function () {
	var width;
	var sizes = "	(max-width: 30em) 1000px,	(max-width: 50em) 750px, 500px	";

	pf.matchesMedia = function(media) {
		return true;
	};

	width = pf.findWidthFromSourceSize(sizes);
	
	expect(width).to.be(1000); // returns 1000 when match media returns true

	pf.matchesMedia = function(media) {
		return false;
	};

	width = pf.findWidthFromSourceSize(sizes);
	expect(width).to.be(500); // returns 500 when match media returns false

	sizes = "100foo, 200px";
	width = pf.findWidthFromSourceSize(sizes);
	expect(width).to.be(200) // returns 200 when there was an unknown css length

	sizes = "100foo, sd2300bar";
	width = pf.findWidthFromSourceSize(sizes);

	expect(width).to.be(Math.max(window.innerWidth || 0, document.documentElement.clientWidth)) // returns 100vw when all sizes are an unknown css length
});

it('parse size', function () {
	var size1 = "";

	expect(pf.parseSize(size1)).to.have.property('length', null); // Length is null as none was specified
	expect(pf.parseSize(size1)).to.have.property('media', null); // Media is null as none was specified

	var size2 = "( max-width: 50em ) 50%";

	expect(pf.parseSize(size2)).to.have.property('length', '50%'); // Length is properly parsed
	expect(pf.parseSize(size2)).to.have.property('media', '( max-width: 50em )'); // Media is properly parsed

	var size3 = "(min-width:30em) calc(30% - 15px)";

	expect(pf.parseSize(size3)).to.have.property('length', 'calc(30% - 15px)'); // Length is properly parsed
	expect(pf.parseSize(size3)).to.have.property('media', '(min-width:30em)'); // Media is properly parsed
});

it('get candidates from source set', function () {
	var candidate1 = "images/pic-medium.png";

	expect(pf.getCandidatesFromSourceSet(candidate1)[0]).to.have.property('resolution', 1); // Resolution is parsed correctly
	expect(pf.getCandidatesFromSourceSet(candidate1)[0]).to.have.property('url', 'images/pic-medium.png'); // Resolution is parsed correctly

	var candidate1a = "images/pic-medium.png 1x";

	expect(pf.getCandidatesFromSourceSet(candidate1a)[0]).to.have.property('resolution', 1); // Resolution is parsed correctly
	expect(pf.getCandidatesFromSourceSet(candidate1a)[0]).to.have.property('url', 'images/pic-medium.png'); // Resolution is parsed correctly

	var candidate2 = "images/pic-medium.png, images/pic-medium-2x.png 2x";

	expect(pf.getCandidatesFromSourceSet(candidate2)[0]).to.have.property('resolution', 1); // Resolution is parsed correctly
	expect(pf.getCandidatesFromSourceSet(candidate2)[0]).to.have.property('url', 'images/pic-medium.png'); // Resolution is parsed correctly

	expect(pf.getCandidatesFromSourceSet(candidate2)[1]).to.have.property('resolution', 2); // Resolution is parsed correctly
	expect(pf.getCandidatesFromSourceSet(candidate2)[1]).to.have.property('url', 'images/pic-medium-2x.png'); // Resolution is parsed correctly

	var candidate3 = "			images/pic-medium.png		 1x		,		 images/pic-medium-2x.png		 2x		";
		
	expect(pf.getCandidatesFromSourceSet(candidate3)[0]).to.have.property('resolution', 1); // Resolution is parsed correctly
	expect(pf.getCandidatesFromSourceSet(candidate3)[0]).to.have.property('url', 'images/pic-medium.png'); // Resolution is parsed correctly

	expect(pf.getCandidatesFromSourceSet(candidate3)[1]).to.have.property('resolution', 2); // Resolution is parsed correctly
	expect(pf.getCandidatesFromSourceSet(candidate3)[1]).to.have.property('url', 'images/pic-medium-2x.png'); // Resolution is parsed correctly

});