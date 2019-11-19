function getSelectedValues(filter) {
    return $(filter + " :checkbox:checked").map(
        function () { return this.value; }).get().join(" ");
}
function getSelectedRadioValues(filter) {
    return $(filter + " :radio:checked").map(
        function () { return this.value; }).get().join("|");
}

$(document).ready(function () {
    $('input.custom-control-input').on('change', function (evt) {
        if ($("input[name='set']:checked").length >= 4) {
            this.checked = false;
        }
    });

    $('#rating-search').keyup(function () {
        var colorSearch = getSelectedValues('.color-filter');
        var raritySearch = getSelectedRadioValues('.rarity-filter');
        RatingsTable.search(colorSearch + ' ' + raritySearch + ' ' + $(this).val()).draw();
    });
    RatingsTable = $('#table_card_rating').DataTable({
        pageLength: 100,
        aaSorting: [],
        dom: "<'row'<'col-sm-5'><'col-sm-2'r><'col-sm-5'>>" +
              "<'row'<'col-sm-12't>>" +
              "<'row'<'col-sm-5'i><'col-sm-7'p>>",
        language: {
            processing: "Loading Data...",
            paginate: {
                first: "<<",
                previous: "<",
                next: ">",
                last: ">>"
            }
        },
        processing: true,
        columnDefs: [
            {
                targets: 0,
                searchable: true,
                responsivePriority: 1,
                sType: "string"
            },
            {
                targets: 1,
                searchable: true,
                responsivePriority: 1
            }
        ]
    });

    $(":checkbox.cfilter-check").change(function () {
        if ($(this).parent().hasClass('active')) {
            $(this).parent().removeClass('btn-default');
            $(this).parent().addClass('btn-primary');
        } else {
            $(this).parent().removeClass('btn-primary');
            $(this).parent().addClass('btn-default');
        }
        var textSearch = $('#rating-search').val();
        var colorSearch = getSelectedValues('.color-filter');
        var raritySearch = getSelectedRadioValues('.rarity-filter');
        RatingsTable.search(textSearch + ' ' + colorSearch + ' ' + raritySearch).draw();
    });

    $(":radio.rfilter-check").change(function () {
        if ($(this).parent().hasClass('active')) {
            $(this).parent().removeClass('btn-default');
            $(this).parent().addClass('btn-primary');
        } 
            $(this).parent().siblings().removeClass('btn-primary');
            $(this).parent().siblings().addClass('btn-default');

        var textSearch = $('#rating-search').val();
        var colorSearch = getSelectedValues('.color-filter');
        var raritySearch = getSelectedRadioValues('.rarity-filter');
        RatingsTable.search(textSearch + ' ' + colorSearch + ' ' + raritySearch).draw();
    });

    $('#rarity-filter').click(function ()
    {
        $('.cfilter-label').removeClass('btn-primary').removeClass('active').addClass('btn-default');
        $('.rfilter-label').removeClass('btn-primary').removeClass('active').addClass('btn-default');
        $(':radio.rfilter-check').prop('checked', false);
        $(':checkbox.cfilter-check').prop('checked', false);
        $('#rating-search').val('');
        RatingsTable.search('').draw();
    });
    $('#table_card_rating').on('click', '.cardLink', function () {
        var name = $(this).attr('data-name'); 
        var rating = $(this).attr('data-rating'); 
        var comment = $(this).attr('data-comment');
        var number = $(this).attr('data-number'); 
        var set = $(this).attr('data-set'); 
        var img = $(this).attr('data-img');
        var commenttext = '';
        if (comment) {
            commenttext += '<p><a href="https://twitter.com/lsv" target="_blank" rel="noopener nofollow"><b>@LSV:</b></a> ' + comment + '</p>';
        }
        $('#modal-cardname').html(name);
        $('#modal-cardcomment').html('<p><b>Card Rating ' + rating + '</b></p>' + commenttext);
        $('#modal-cardimg').html('<img class="card-modal-img img-fluid" alt="image" src="' + img + '" height="311" width="223" />');
        $('#modal-cardlink').prop('href','/Card/' + set + '/' + name + '/' + number);
    });
});